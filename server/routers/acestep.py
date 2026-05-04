import os
import shutil
import uuid
import threading
import logging
import re
import requests
import json
import subprocess
import sys
import time
import io
from pathlib import Path
from typing import Optional, List, Dict
from fastapi import APIRouter, UploadFile, File, HTTPException, Body, Request, Form, BackgroundTasks
from pydantic import BaseModel
import torch
import numpy as np
import librosa
import soundfile as sf

from core.config import settings
from core.state import tasks
from core.utils import resolve_web_path, download_audio_from_url, parse_subtitle_to_lyrics, structure_whisper_output
import acestep_service

def to_web_path(path: Path) -> str:
    try:
        rel = path.relative_to(settings.upload_dir)
        return f"/uploads/{rel.as_posix()}"
    except ValueError:
        pass

    try:
        rel = path.relative_to(settings.output_dir)
        return f"/outputs/{rel.as_posix()}"
    except ValueError:
        pass

    return str(path)

logger = logging.getLogger("SunoArchitect.AceStep")

router = APIRouter(prefix="/acestep", tags=["acestep"])

# Models
class AceStepRequest(BaseModel):
    prompt: str = ""
    lyrics: str = ""
    thinking: bool = False
    inference_steps: int = 8
    guidance_scale: float = 7.0
    use_random_seed: bool = True
    seed: int = -1
    batch_size: int = 1
    duration: float = -1
    language: str = "en"
    model: str = "acestep-v15-turbo"
    sample_mode: bool = False
    sample_query: str = ""
    task_type: str = "text2music"
    audio_cover_strength: float = 0.8
    repainting_start: Optional[float] = None
    repainting_end: Optional[float] = None
    src_audio_path: Optional[str] = None
    use_adg: bool = False
    reference_audio_path: Optional[str] = None
    track_name: Optional[str] = None

class PostProcessRequest(BaseModel):
    file_url: str
    fade_duration: float = 3.0
    auto_trim: bool = True

class ExtractLyricsRequest(BaseModel):
    url: Optional[str] = None
    audio_path: Optional[str] = None
    language: str = "ja"

class SeparateRequest(BaseModel):
    file_url: str

class AnalyzeRequest(BaseModel):
    file_path: str

class CLAPSearchRequest(BaseModel):
    file_path: str
    query: str
    window_sec: float = 5.0
    top_k: int = 5

class MinimaxRequest(BaseModel):
    lyrics: str
    prompt: str

# Directories
UPLOAD_DIR = settings.upload_dir
OUTPUT_DIR = settings.output_dir
ACESTEP_SOURCE_DIR = UPLOAD_DIR / "acestep_source"
ACESTEP_SOURCE_DIR.mkdir(parents=True, exist_ok=True)
MERGED_DIR = OUTPUT_DIR / "merged"
MERGED_DIR.mkdir(parents=True, exist_ok=True)
SEPARATION_DIR = settings.separation_dir
SEPARATION_DIR.mkdir(parents=True, exist_ok=True)
VC_DIR = OUTPUT_DIR / "voice_converted"
VC_DIR.mkdir(parents=True, exist_ok=True)

# Background Tasks
def run_separation_task(task_id: str, input_path: Path):
    try:
        from audio_separator.separator import Separator
        output_dir = SEPARATION_DIR / task_id
        output_dir.mkdir(parents=True, exist_ok=True)
        
        separator = Separator(output_dir=str(output_dir), output_format="wav")
        tasks[task_id]["progress"] = 15
        
        if tasks[task_id].get("status") == "cancelled": return
        
        separator.load_model(model_filename="htdemucs_ft.yaml")
        tasks[task_id]["progress"] = 25
        
        output_files = separator.separate(str(input_path))
        
        vocals_path = output_dir / "vocals.wav"
        inst_path = output_dir / "instrumental.wav"
        
        for fname in output_files:
            fpath = output_dir / fname
            if "Vocals" in fname:
                if vocals_path.exists(): vocals_path.unlink()
                fpath.rename(vocals_path)
            elif "Instrumental" in fname:
                if inst_path.exists(): inst_path.unlink()
                fpath.rename(inst_path)
        
        tasks[task_id]["result"] = {
            "vocals_url": f"/outputs/separated/{task_id}/vocals.wav",
            "instrumental_url": f"/outputs/separated/{task_id}/instrumental.wav",
            "original_path": to_web_path(input_path)
        }
        tasks[task_id]["status"] = "completed"
        tasks[task_id]["progress"] = 100
    except Exception as e:
        logger.error(f"Separation failed: {e}")
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"] = str(e)

def run_voice_conversion_task(
    task_id: str, 
    instrumental_path: Path, 
    vocals_path: Path, 
    reference_path: Path,
    original_path: Path = None,
    diffusion_steps: int = 50,
    f0_condition: bool = True,
    auto_f0_adjust: bool = False,
    pitch_shift: int = 0
):
    try:
        from pedalboard import Pedalboard, Compressor, HighpassFilter, Reverb, PeakFilter
        import matchering as mg
        
        if tasks[task_id].get("status") == "cancelled": return
        
        tasks[task_id]["status"] = "processing"
        tasks[task_id]["progress"] = 5
        
        seed_vc_dir = settings.project_dir / "seed-vc"
        output_dir = VC_DIR / task_id
        output_dir.mkdir(parents=True, exist_ok=True)
        
        cmd = [
            sys.executable, "inference.py",
            "--source", str(vocals_path),
            "--target", str(reference_path),
            "--output", str(output_dir),
            "--diffusion-steps", str(diffusion_steps),
            "--f0-condition", str(f0_condition),
            "--auto-f0-adjust", str(auto_f0_adjust),
            "--semi-tone-shift", str(pitch_shift),
            "--fp16", "True"
        ]
        
        subprocess.run(cmd, cwd=str(seed_vc_dir), check=True, capture_output=True, text=True)
        tasks[task_id]["progress"] = 85
        
        converted_vocal_path = next(output_dir.glob("vc_*.wav"), None)
        if not converted_vocal_path: raise Exception("Converted vocal file not found")
        
        # Pro Mixing
        vox_converted, sr = librosa.load(str(converted_vocal_path), sr=None, mono=False)
        if vox_converted.ndim == 1: vox_converted = vox_converted[np.newaxis, :]
        
        inst_audio, _ = librosa.load(str(instrumental_path), sr=sr, mono=False)
        if inst_audio.ndim == 1: inst_audio = inst_audio[np.newaxis, :]
        
        # Pre-process vocals
        vocal_proc = Pedalboard([
            Compressor(threshold_db=-20.0, ratio=3.0, attack_ms=10.0, release_ms=150.0),
            HighpassFilter(cutoff_frequency_hz=80.0)
        ])
        vox_processed = vocal_proc(vox_converted, sr)
        
        min_len = min(vox_processed.shape[1], inst_audio.shape[1])
        mixed = vox_processed[:, :min_len] * 0.95 + inst_audio[:, :min_len]
        
        pre_master = output_dir / "pre_master.wav"
        sf.write(str(pre_master), mixed.T, sr)
        
        final_output = output_dir / "merged_output.wav"
        if original_path and original_path.exists():
            try:
                mg.process(target=str(pre_master), reference=str(original_path), results=[mg.pcm24(str(final_output))])
            except:
                shutil.copy(pre_master, final_output)
        else:
            shutil.copy(pre_master, final_output)
            
        tasks[task_id]["status"] = "completed"
        tasks[task_id]["progress"] = 100
        tasks[task_id]["result"] = {"merged_url": f"/outputs/voice_converted/{task_id}/merged_output.wav"}
    except Exception as e:
        logger.error(f"VC failed: {e}")
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"] = str(e)

# Endpoints
@router.post("/upload-source")
async def acestep_upload_source(file: UploadFile = File(...)):
    # Legacy wrapper
    try:
        ext = Path(file.filename).suffix or ".mp3"
        file_id = str(uuid.uuid4())
        filename = f"{file_id}{ext}"
        filepath = ACESTEP_SOURCE_DIR / filename
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"status": "success", "path": str(filepath.resolve())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/download-url")
async def acestep_download_url(request: Request):
    # Legacy wrapper
    body = await request.json()
    url = body.get("url")
    if not url: raise HTTPException(status_code=400, detail="URL is required")
    try:
        final_path = await download_audio_from_url(url, ACESTEP_SOURCE_DIR)
        return {"path": str(final_path.resolve())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate")
async def acestep_generate(request: AceStepRequest):
    result = acestep_service.release_task(
        request.prompt, request.lyrics, thinking=request.thinking,
        inference_steps=request.inference_steps, batch_size=request.batch_size,
        audio_duration=request.duration, vocal_language=request.language,
        model=request.model, sample_mode=request.sample_mode,
        sample_query=request.sample_query, seed=request.seed,
        task_type=request.task_type, audio_cover_strength=request.audio_cover_strength,
        repainting_start=request.repainting_start, repainting_end=request.repainting_end,
        src_audio_path=request.src_audio_path, use_adg=request.use_adg,
        reference_audio_path=request.reference_audio_path, track_name=request.track_name
    )
    if "error" in result and result["error"]:
        raise HTTPException(status_code=500, detail=result["error"])
    
    # Normalize response shape for frontend
    # Expected: { "task_id": "..." }
    task_id = result.get("task_id") or (result.get("data", {}) if isinstance(result.get("data"), dict) else {}).get("task_id")
    
    return {
        "task_id": task_id,
        "data": result.get("data") if isinstance(result.get("data"), dict) else result,
        "raw": result
    }

@router.post("/minimax/generate")
async def generate_minimax(request: MinimaxRequest):
    from minimax_service import generate_music_minimax
    try:
        return generate_music_minimax(request.lyrics, request.prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status/{task_id}")
async def get_acestep_status(task_id: str):
    """
    Get the status of an ACE-Step task with normalized output files.
    """
    result = acestep_service.query_result(task_id)
    
    if not result:
        # Check local task store fallback
        if task_id in tasks:
            task = tasks[task_id]
            return {
                "task_id": task_id,
                "status": task.get("status", "processing"),
                "progress": task.get("progress", 0),
                "output_files": task.get("output_files", []),
                "result": task.get("result"),
                "error": task.get("error"),
            }
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Map status from external service
    raw_status = result.get("status")
    if raw_status == 1:
        status = "completed"
    elif raw_status in [-1, 2]:
        status = "failed"
    else:
        status = "processing"
    
    # Normalize output files for frontend
    output_files = []
    if status == "completed":
        res_data = result.get("result")
        # ACE-Step result can be a dict with 'data' containing 'output_files'
        if isinstance(res_data, dict):
            files = []
            if "data" in res_data and isinstance(res_data["data"], dict):
                files = res_data["data"].get("output_files", [])
            elif "output_files" in res_data:
                files = res_data.get("output_files", [])
            elif "merged_url" in res_data:
                # Merged URL already in result
                output_files.append({
                    "url": res_data["merged_url"],
                    "label": "Merged Output"
                })
                files = [] # Skip loop below
            
            for f in files:
                # Convert to web URL
                output_files.append({
                    "url": f"/outputs/acestep/{Path(f).name}",
                    "label": "Generated Audio"
                })

    return {
        "task_id": task_id,
        "status": status,
        "progress": 100 if status == "completed" else 0,
        "output_files": output_files,
        "result": result.get("result"),
        "error": result.get("error")
    }

@router.post("/separate")
async def acestep_separate(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    try:
        # Save uploaded file
        ext = Path(file.filename).suffix or ".mp3"
        file_id = str(uuid.uuid4())
        filepath = ACESTEP_SOURCE_DIR / f"sep_input_{file_id}{ext}"
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        task_id = f"sep_{uuid.uuid4().hex[:8]}"
        tasks[task_id] = {"status": "processing", "progress": 0, "type": "separation"}
        background_tasks.add_task(run_separation_task, task_id, filepath)
        return {"task_id": task_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/separate-url")
async def acestep_separate_url(request: SeparateRequest, background_tasks: BackgroundTasks):
    try:
        # P0-2: Handle both local paths and external URLs
        if request.file_url.startswith(("http://", "https://")):
            local_path = await download_audio_from_url(request.file_url, ACESTEP_SOURCE_DIR)
        else:
            local_path = resolve_web_path(request.file_url)
            
        if not local_path or not local_path.exists():
            raise HTTPException(status_code=404, detail="Audio file not found")
            
        task_id = f"sep_{uuid.uuid4().hex[:8]}"
        tasks[task_id] = {"status": "processing", "progress": 0, "type": "separation"}
        background_tasks.add_task(run_separation_task, task_id, local_path)
        return {"task_id": task_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Separate URL error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/voice-convert")
async def acestep_voice_convert(
    background_tasks: BackgroundTasks,
    instrumental_url: str = Form(...),
    vocals_url: str = Form(...),
    reference_audio: UploadFile = File(...),
    original_url: Optional[str] = Form(None),
    diffusion_steps: int = Form(50),
    f0_condition: bool = Form(True),
    auto_f0_adjust: bool = Form(False),
    pitch_shift: int = Form(0)
):
    try:
        inst_path = resolve_web_path(instrumental_url)
        vox_path = resolve_web_path(vocals_url)
        orig_path = resolve_web_path(original_url) if original_url else None
        
        ref_path = ACESTEP_SOURCE_DIR / f"ref_{uuid.uuid4().hex[:8]}{Path(reference_audio.filename).suffix}"
        with open(ref_path, "wb") as buffer:
            shutil.copyfileobj(reference_audio.file, buffer)
            
        task_id = f"vc_{uuid.uuid4().hex[:8]}"
        tasks[task_id] = {"status": "processing", "progress": 0, "type": "voice_conversion"}
        
        background_tasks.add_task(
            run_voice_conversion_task, 
            task_id, inst_path, vox_path, ref_path, orig_path,
            diffusion_steps, f0_condition, auto_f0_adjust, pitch_shift
        )
        return {"task_id": task_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/extract-lyrics")
async def acestep_extract_lyrics(request: ExtractLyricsRequest):
    try:
        audio_path = None
        if request.url:
            audio_path = await download_audio_from_url(request.url, ACESTEP_SOURCE_DIR)
        elif request.audio_path:
            audio_path = resolve_web_path(request.audio_path)
            
        if not audio_path or not audio_path.exists():
            raise HTTPException(status_code=404, detail="Audio file not found")
            
        import whisper_service
        result = whisper_service.get_whisper_service().transcribe(str(audio_path), language=request.language)
        return {"lyrics": result.get("text", ""), "segments": result.get("segments", [])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/llm-proxy")
async def acestep_llm_proxy(request: Request):
    body = await request.json()
    import gemini_service
    return await gemini_service.llm_proxy(body)

@router.post("/analyze")
async def acestep_analyze(request: AnalyzeRequest):
    fs_path = resolve_web_path(request.file_path)
    if not fs_path.exists(): raise HTTPException(status_code=404, detail="File not found")
    import audio_analysis
    return audio_analysis.get_analyzer().analyze(str(fs_path))

@router.post("/clap/search")
async def acestep_clap_search(request: CLAPSearchRequest):
    fs_path = resolve_web_path(request.file_path)
    if not fs_path.exists(): raise HTTPException(status_code=404, detail="File not found")
    import clap_service
    return clap_service.get_clap_service().search_by_text(str(fs_path), request.query, window_sec=request.window_sec, top_k=request.top_k)

@router.get("/clap/presets")
async def get_clap_presets():
    """Return standard presets for CLAP search from service"""
    import clap_service
    presets = clap_service.get_clap_service().get_preset_queries()
    return {"presets": presets}

@router.post("/post-process")
async def acestep_post_process(request: PostProcessRequest):
    try:
        local_path = resolve_web_path(request.file_url)
        y, sr = librosa.load(str(local_path), sr=None, mono=False)
        
        # Fade out
        fade_samples = int(request.fade_duration * sr)
        if fade_samples > 0:
            fade_curve = np.linspace(1.0, 0.0, fade_samples) ** 2
            if y.ndim > 1: y[:, -fade_samples:] *= fade_curve
            else: y[-fade_samples:] *= fade_curve
            
        processed_path = MERGED_DIR / f"proc_{uuid.uuid4().hex[:8]}.wav"
        sf.write(str(processed_path), y.T if y.ndim > 1 else y, sr)
        return {"status": "success", "url": f"/outputs/merged/{processed_path.name}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
