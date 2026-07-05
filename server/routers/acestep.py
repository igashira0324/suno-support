import os
import shutil
import uuid
import logging
import re
import requests
import json
import ast
import time
import sys
import subprocess
from pathlib import Path
from urllib.parse import quote, unquote, urlparse
from typing import Optional, List, Dict
from fastapi import APIRouter, UploadFile, File, HTTPException, Body, Request, Form, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import torch
import numpy as np
import librosa
import soundfile as sf
from pydub import AudioSegment

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

def transcode_to_mp3(src_path: Path, dst_path: Optional[Path] = None, bitrate: str = "320k") -> Path:
    """
    Convert audio file to MP3 using pydub/ffmpeg.
    If src is already mp3, returns src_path unless dst_path is specified.
    P1: Now checks if source is newer than existing destination.
    """
    src_path = Path(src_path)

    if dst_path is None:
        dst_path = src_path.with_suffix(".mp3")
    else:
        dst_path = Path(dst_path)

    dst_path.parent.mkdir(parents=True, exist_ok=True)

    # Return if destination already exists, is not empty, and is newer than source
    if dst_path.exists() and dst_path.stat().st_size > 0:
        if dst_path.suffix.lower() == ".mp3" and dst_path.stat().st_mtime >= src_path.stat().st_mtime:
            return dst_path

    # If already mp3, just copy to destination and return
    if src_path.suffix.lower() == ".mp3":
        if src_path.resolve() == dst_path.resolve():
            return src_path
        shutil.copy2(src_path, dst_path)
        return dst_path

    # Transcode using pydub
    try:
        audio = AudioSegment.from_file(str(src_path))
        audio.export(str(dst_path), format="mp3", bitrate=bitrate)
        return dst_path
    except Exception:
        logger.exception(f"Error transcoding to mp3: {src_path} -> {dst_path}")
        raise


router = APIRouter(prefix="/acestep", tags=["acestep"])
ACESTEP_LOCAL_DIR = settings.output_dir / "acestep_generated"
ACESTEP_LOCAL_DIR.mkdir(parents=True, exist_ok=True)

@router.get("/health")
async def acestep_health():
    """
    Proxy health check to the ACE-Step API Server (Port 8101).
    Used by the frontend to prevent generating before models are loaded.
    Preserve upstream HTTP status code.
    """
    try:
        r = requests.get(f"{acestep_service.ACESTEP_API_URL}/health", timeout=3)
        try:
            content = r.json()
        except Exception:
            content = {"status": "error", "detail": r.text}
        
        return JSONResponse(status_code=r.status_code, content=content)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

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
    shift: float = 1.0
    infer_method: str = "ode"
    # Optional musical metadata locks (constrained decoding injects them into the LM plan)
    bpm: Optional[int] = None
    key_scale: Optional[str] = None
    time_signature: Optional[str] = None

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

class VocalOverlayRequest(BaseModel):
    """Add AI-generated singing to an instrumental while keeping the ORIGINAL
    instrumental untouched as the mix base (vocals are layered on top)."""
    instrumental_url: str
    prompt: str = ""
    lyrics: str = ""
    language: str = "ja"
    # How tightly the generated vocal is bound to the source track (0.1-0.9)
    audio_cover_strength: float = 0.5
    # Volume of the overlaid vocal relative to the instrumental
    vocal_gain: float = 0.95
    # Optional matchering master pass (off by default: reference is vocal-less)
    master: bool = False
    inference_steps: int = 8
    guidance_scale: float = 7.0
    shift: float = 1.0
    infer_method: str = "ode"
    seed: int = -1
    # thinking=False (default): DiT listens to the instrumental directly and composes
    # vocals aligned to it (official lego behavior). thinking=True: the 5Hz LM plans the
    # song blind and its codes steer generation (more creative, less aligned).
    thinking: bool = False

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
OVERLAY_DIR = OUTPUT_DIR / "vocal_overlay"
OVERLAY_DIR.mkdir(parents=True, exist_ok=True)

# Background Tasks
def run_separation_task(task_id: str, input_path: Path):
    try:
        from audio_separator.separator import Separator
        output_dir = SEPARATION_DIR / task_id
        output_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"Starting separation task {task_id} for {input_path}")
        separator = Separator(output_dir=str(output_dir), output_format="wav")
        tasks[task_id]["progress"] = 15
        
        if tasks[task_id].get("status") == "cancelled": return
        
        # Using htdemucs_ft as default for high quality 4-stem
        model_name = "htdemucs_ft.yaml"
        separator.load_model(model_filename=model_name)
        tasks[task_id]["progress"] = 25
        
        output_files = separator.separate(str(input_path))
        logger.info(f"Separation completed. Output files: {output_files}")
        
        vocals_path = output_dir / "vocals.wav"
        inst_path = output_dir / "instrumental.wav"
        
        found_vocals = None
        found_inst = None
        other_stems = []
        
        for fname in output_files:
            fpath = output_dir / fname
            fname_lower = fname.lower()
            if "vocals" in fname_lower:
                found_vocals = fpath
            elif any(x in fname_lower for x in ["instrumental", "karaoke", "backing", "no_vocals"]):
                found_inst = fpath
            else:
                other_stems.append(fpath)
        
        # 1. Process Vocals
        if found_vocals:
            if vocals_path.exists(): vocals_path.unlink()
            found_vocals.rename(vocals_path)
            logger.info(f"Saved vocals to {vocals_path}")
        else:
            logger.warning("No vocals found in separation output!")
            
        # 2. Process Instrumental
        if found_inst:
            if inst_path.exists(): inst_path.unlink()
            found_inst.rename(inst_path)
            logger.info(f"Saved instrumental to {inst_path}")
        elif other_stems:
            # If no direct instrumental, mix all other stems
            logger.info(f"No direct instrumental found. Mixing {len(other_stems)} stems: {[s.name for s in other_stems]}")
            mixed_audio = None
            target_sr = None
            
            for stem_path in other_stems:
                try:
                    # Load audio (preserve sr and channels)
                    y, sr = librosa.load(str(stem_path), sr=None, mono=False)
                    
                    # Normalize to (channels, samples)
                    if y.ndim == 1:
                        y = y[np.newaxis, :]
                    
                    if mixed_audio is None:
                        mixed_audio = y
                        target_sr = sr
                    else:
                        # Match sample rate if necessary
                        if sr != target_sr:
                            y = librosa.resample(y, orig_sr=sr, target_sr=target_sr)
                        
                        # Match channels if necessary
                        if mixed_audio.shape[0] != y.shape[0]:
                            if mixed_audio.shape[0] == 1: # mixed is mono, y is stereo
                                mixed_audio = np.repeat(mixed_audio, y.shape[0], axis=0)
                            elif y.shape[0] == 1: # y is mono, mixed is stereo
                                y = np.repeat(y, mixed_audio.shape[0], axis=0)
                        
                        # Match length
                        min_len = min(mixed_audio.shape[1], y.shape[1])
                        mixed_audio = mixed_audio[:, :min_len] + y[:, :min_len]
                        
                except Exception as mix_err:
                    logger.error(f"Failed to mix stem {stem_path.name}: {mix_err}")
            
            if mixed_audio is not None:
                # Clipping prevention: normalize to -1.0 to 1.0 range
                max_val = np.max(np.abs(mixed_audio))
                if max_val > 1.0:
                    mixed_audio = mixed_audio / (max_val + 1e-6)
                    logger.info(f"Normalized mixed audio to prevent clipping (max was {max_val})")
                
                # soundfile expects (samples, channels)
                sf.write(str(inst_path), mixed_audio.T, target_sr)
                logger.info(f"Created combined instrumental at {inst_path}")
        
        # Final validation: Both stems are mandatory for Music Architect pipeline
        if not vocals_path.exists() or not inst_path.exists():
            missing = []
            if not vocals_path.exists(): missing.append("vocals")
            if not inst_path.exists(): missing.append("instrumental")
            raise Exception(f"Separation failed: Missing required stems: {', '.join(missing)}")
        
        # Transcode results to MP3 for UI/Browser usage
        vocals_mp3 = transcode_to_mp3(vocals_path)
        inst_mp3 = transcode_to_mp3(inst_path)

        tasks[task_id]["result"] = {
            "vocals_url": f"/outputs/separated/{task_id}/vocals.mp3" if vocals_mp3.exists() else None,
            "instrumental_url": f"/outputs/separated/{task_id}/instrumental.mp3" if inst_mp3.exists() else None,
            # Keep WAV URLs for internal/high-quality use
            "vocals_wav_url": f"/outputs/separated/{task_id}/vocals.wav" if vocals_path.exists() else None,
            "instrumental_wav_url": f"/outputs/separated/{task_id}/instrumental.wav" if inst_path.exists() else None,
            "original_path": to_web_path(input_path)
        }
        tasks[task_id]["status"] = "completed"
        tasks[task_id]["progress"] = 100
        logger.info(f"Separation task {task_id} finished successfully with MP3 output.")
        
    except Exception as e:
        logger.error(f"Separation failed for {task_id}: {e}")
        import traceback
        logger.error(traceback.format_exc())
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
        
        start_time_vc = time.time()
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
            except Exception as m_err:
                logger.warning(f"Mastering failed, using unmastered mix: {m_err}")
                shutil.copy(pre_master, final_output)
        else:
            shutil.copy(pre_master, final_output)

        # Final MP3 Transcoding
        final_mp3 = transcode_to_mp3(final_output)
        if not final_mp3.exists():
            raise Exception(f"MP3 transcoding produced no file: {final_mp3}")

        tasks[task_id]["status"] = "completed"
        tasks[task_id]["progress"] = 100
        tasks[task_id]["result"] = {
            "merged_url": f"/outputs/voice_converted/{task_id}/merged_output.mp3",
            "merged_wav_url": f"/outputs/voice_converted/{task_id}/merged_output.wav",
            "processing_time": round(time.time() - start_time_vc, 2),
            "format": "mp3",
            "bitrate": "320k"
        }
    except Exception as e:
        logger.error(f"VC failed: {e}")
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"] = str(e)

def separate_vocals_stem(input_path: Path, output_dir: Path) -> Optional[Path]:
    """Run Demucs (htdemucs_ft) and return ONLY the isolated vocals stem path."""
    from audio_separator.separator import Separator
    output_dir.mkdir(parents=True, exist_ok=True)
    separator = Separator(output_dir=str(output_dir), output_format="wav")
    separator.load_model(model_filename="htdemucs_ft.yaml")
    output_files = separator.separate(str(input_path))
    for fname in output_files:
        if "vocals" in fname.lower():
            return output_dir / fname
    return None


def _extract_acestep_output_path(result_field) -> Optional[Path]:
    """Extract a local filesystem path from an ACE-Step query_result 'result' field.

    ACE-Step returns results in several shapes (JSON string, list of dicts, dict).
    Mirrors the tolerant extraction used by /status but resolves to a real file path.
    """
    res = result_field
    if isinstance(res, str):
        try:
            res = json.loads(res)
        except Exception:
            try:
                res = ast.literal_eval(res)
            except Exception:
                res = result_field

    files = []
    if isinstance(res, list):
        files = res
    elif isinstance(res, dict):
        if isinstance(res.get("result"), list):
            files = res["result"]
        elif isinstance(res.get("data"), list):
            files = res["data"]
        else:
            files = [res]

    for f in files:
        raw = None
        if isinstance(f, str):
            raw = f
        elif isinstance(f, dict):
            raw = (f.get("url") or f.get("file") or f.get("audio_url")
                   or f.get("audio") or f.get("path") or f.get("output"))
        if not raw:
            continue
        for candidate in (str(raw), normalize_acestep_audio_url(str(raw))):
            try:
                p = resolve_web_path(candidate)
                if p and Path(p).exists():
                    return Path(p)
            except Exception:
                continue
    return None


def analyze_music_profile(audio_path: Path):
    """Estimate (bpm, key_scale, duration_sec) of an audio file.

    The ACE-Step 5Hz LM plans vocals WITHOUT hearing the source audio, so we lock
    tempo/key/duration via request metadata (constrained decoding) to make the
    planned vocals fit the uploaded instrumental.
    """
    duration = None
    try:
        try:
            duration = float(librosa.get_duration(path=str(audio_path)))
        except TypeError:
            # Older librosa uses filename= instead of path=
            duration = float(librosa.get_duration(filename=str(audio_path)))
    except Exception as e:
        logger.warning(f"Duration analysis failed for {audio_path}: {e}")

    bpm = None
    key_scale = None
    try:
        analysis_window = min(duration, 120.0) if duration else 120.0
        y, sr = librosa.load(str(audio_path), sr=22050, mono=True, duration=analysis_window)

        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        tempo = float(np.atleast_1d(tempo)[0])
        if 30 <= tempo <= 300:
            bpm = int(round(tempo))

        # Krumhansl-Schmuckler key estimation from averaged chroma
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr).mean(axis=1)
        major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
        minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
        pitch_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        best_corr, best_key = -2.0, None
        for i in range(12):
            rotated = np.roll(chroma, -i)
            corr_major = float(np.corrcoef(rotated, major_profile)[0, 1])
            corr_minor = float(np.corrcoef(rotated, minor_profile)[0, 1])
            if corr_major > best_corr:
                best_corr, best_key = corr_major, f"{pitch_names[i]} major"
            if corr_minor > best_corr:
                best_corr, best_key = corr_minor, f"{pitch_names[i]} minor"
        key_scale = best_key
    except Exception as e:
        logger.warning(f"Tempo/key analysis failed for {audio_path}: {e}")

    return bpm, key_scale, duration


def run_vocal_overlay_task(
    task_id: str,
    instrumental_path: Path,
    prompt: str,
    lyrics: str,
    language: str = "ja",
    audio_cover_strength: float = 0.5,
    vocal_gain: float = 0.95,
    master: bool = False,
    inference_steps: int = 8,
    guidance_scale: float = 7.0,
    shift: float = 1.0,
    infer_method: str = "ode",
    seed: int = -1,
    thinking: bool = False,
):
    """Generate AI singing for an instrumental, keeping the ORIGINAL instrumental
    as the exact mix base.

    Pipeline:
      1. ACE-Step 'lego' generation -> full vocals+instrumental mix (re-rendered).
      2. Demucs isolates ONLY the vocal stem from that generated mix.
      3. Overlay that vocal onto the ORIGINAL uploaded instrumental (never re-encoded).
    """
    try:
        start_t = time.time()
        tasks[task_id]["status"] = "processing"
        tasks[task_id]["progress"] = 2
        tasks[task_id]["stage"] = "Analyzing instrumental (BPM/key)"

        # 0) Analyze the instrumental so the LM plans vocals that actually fit it.
        #    The 5Hz LM cannot hear the source; without these locks it invents its own
        #    tempo/key/duration and the vocals won't align with the uploaded track.
        inst_bpm, inst_key, inst_duration = analyze_music_profile(instrumental_path)
        logger.info(f"[{task_id}] Instrumental profile: bpm={inst_bpm}, key={inst_key}, duration={inst_duration}")

        # This pipeline always runs the BASE model; turbo-oriented defaults from the
        # frontend (8 steps, shift=1.0) leave the output under-denoised and vocals
        # never materialize. Clamp to base-sane sampling values.
        if inference_steps < 16:
            logger.info(f"[{task_id}] inference_steps={inference_steps} too low for base model, raising to 32")
            inference_steps = 32
        if shift <= 1.0:
            shift = 3.0

        tasks[task_id]["progress"] = 3
        tasks[task_id]["stage"] = "Generating vocals with ACE-Step"

        # 1) Submit ACE-Step lego generation (source = the instrumental).
        release = acestep_service.release_task(
            prompt, lyrics,
            task_type="lego",
            src_audio_path=str(instrumental_path),
            track_name="vocals",
            model="acestep-v15-base",
            audio_cover_strength=audio_cover_strength,
            vocal_language=language,
            inference_steps=inference_steps,
            guidance_scale=guidance_scale,
            shift=shift,
            infer_method=infer_method,
            seed=seed,
            audio_duration=inst_duration if inst_duration and inst_duration > 0 else -1,
            bpm=inst_bpm,
            key_scale=inst_key,
            thinking=thinking,
        )
        if release.get("error"):
            raise Exception(f"ACE-Step generation failed to start: {release.get('error')}")
        ace_task_id = release.get("task_id") or (release.get("data") or {}).get("task_id")
        if not ace_task_id:
            raise Exception("ACE-Step did not return a task_id")

        # 2) Poll ACE-Step until the mix is ready.
        # Base-model generation is slow on 12GB VRAM (roughly 4-6s of compute per second
        # of audio at 32 steps), so scale the ceiling with track length instead of a
        # flat 15 minutes (a 225s track needs ~20 min).
        gen_timeout = max(900, int((inst_duration or 240) * 8))
        ace_output = None
        deadline = time.time() + gen_timeout
        while time.time() < deadline:
            if tasks[task_id].get("status") == "cancelled":
                return
            info = acestep_service.query_result(ace_task_id)
            st = info.get("status")
            if st == 1:
                ace_output = _extract_acestep_output_path(info.get("result"))
                break
            if st in (-1, 2):
                raise Exception(f"ACE-Step generation failed: {info.get('error')}")
            # Reflect real ACE-Step progress in the 5-45 band while generating.
            try:
                ace_prog = float(info.get("progress") or 0.0)
                tasks[task_id]["progress"] = min(45, max(5, int(5 + ace_prog * 40)))
            except (TypeError, ValueError):
                tasks[task_id]["progress"] = min(45, max(5, tasks[task_id].get("progress", 5) + 1))
            time.sleep(3)

        if ace_output is None or not ace_output.exists():
            raise Exception("ACE-Step generation timed out or produced no output")

        tasks[task_id]["progress"] = 50
        tasks[task_id]["stage"] = "Separating vocal stem"

        # 3) Isolate ONLY the vocal from the generated mix.
        sep_dir = OVERLAY_DIR / task_id / "separation"
        vocals_stem = separate_vocals_stem(ace_output, sep_dir)
        if not vocals_stem or not vocals_stem.exists():
            raise Exception("Failed to isolate vocal stem from generated audio")

        tasks[task_id]["progress"] = 75
        tasks[task_id]["stage"] = "Mixing onto original instrumental"

        # 4) Overlay the vocal onto the ORIGINAL instrumental (untouched base).
        from pedalboard import Pedalboard, Compressor, HighpassFilter

        output_dir = OVERLAY_DIR / task_id
        output_dir.mkdir(parents=True, exist_ok=True)

        vox, sr = librosa.load(str(vocals_stem), sr=None, mono=False)
        if vox.ndim == 1:
            vox = vox[np.newaxis, :]
        inst_audio, _ = librosa.load(str(instrumental_path), sr=sr, mono=False)
        if inst_audio.ndim == 1:
            inst_audio = inst_audio[np.newaxis, :]

        # Clean the vocal: gentle compression + high-pass to drop low-end bleed.
        vocal_proc = Pedalboard([
            Compressor(threshold_db=-20.0, ratio=3.0, attack_ms=10.0, release_ms=150.0),
            HighpassFilter(cutoff_frequency_hz=80.0),
        ])
        vox = vocal_proc(vox, sr)

        # Match channel counts (vocal may be mono, instrumental stereo or vice versa).
        if vox.shape[0] != inst_audio.shape[0]:
            if inst_audio.shape[0] == 1:
                inst_audio = np.repeat(inst_audio, vox.shape[0], axis=0)
            elif vox.shape[0] == 1:
                vox = np.repeat(vox, inst_audio.shape[0], axis=0)

        min_len = min(vox.shape[1], inst_audio.shape[1])
        mixed = vox[:, :min_len] * float(vocal_gain) + inst_audio[:, :min_len]

        # Prevent clipping without altering the instrumental's balance.
        max_val = np.max(np.abs(mixed))
        if max_val > 1.0:
            mixed = mixed / (max_val + 1e-6)

        pre_master = output_dir / "pre_master.wav"
        sf.write(str(pre_master), mixed.T, sr)

        final_output = output_dir / "merged_output.wav"
        if master:
            try:
                import matchering as mg
                mg.process(
                    target=str(pre_master),
                    reference=str(instrumental_path),
                    results=[mg.pcm24(str(final_output))],
                )
            except Exception as m_err:
                logger.warning(f"Mastering failed, using unmastered mix: {m_err}")
                shutil.copy(pre_master, final_output)
        else:
            shutil.copy(pre_master, final_output)

        tasks[task_id]["progress"] = 92
        tasks[task_id]["stage"] = "Finalizing"
        overlay_mp3 = transcode_to_mp3(final_output)
        if not overlay_mp3.exists():
            raise Exception(f"MP3 transcoding produced no file: {overlay_mp3}")

        tasks[task_id]["status"] = "completed"
        tasks[task_id]["progress"] = 100
        tasks[task_id]["result"] = {
            "merged_url": f"/outputs/vocal_overlay/{task_id}/merged_output.mp3",
            "merged_wav_url": f"/outputs/vocal_overlay/{task_id}/merged_output.wav",
            "processing_time": round(time.time() - start_t, 2),
            "format": "mp3",
            "bitrate": "320k",
        }
    except Exception as e:
        logger.error(f"Vocal overlay failed for {task_id}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"] = str(e)


# Endpoints
@router.post("/upload-source")
async def acestep_upload_source(file: UploadFile = File(...)):
    # Legacy wrapper
    try:
        # P2: Handle None content_type
        content_type = file.content_type or ""
        # P1: Preserve original extension or guess from content type
        orig_ext = Path(file.filename or "").suffix
        if not orig_ext:
            if "audio/mpeg" in content_type:
                ext = ".mp3"
            elif "audio/wav" in content_type or "audio/x-wav" in content_type:
                ext = ".wav"
            else:
                ext = ".mp3" # Default fallback
        else:
            ext = orig_ext

        file_id = str(uuid.uuid4())
        filename = f"{file_id}{ext}"
        filepath = ACESTEP_SOURCE_DIR / filename
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"status": "success", "path": str(filepath.resolve())}
    except HTTPException:
        raise
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

from urllib.parse import quote

def normalize_acestep_audio_url(raw_url: str) -> str:
    """
    Normalize ACE-Step audio output into playable absolute URL.
    Supports: http://..., /v1/audio?path=..., and local filesystem paths.
    """
    if not raw_url:
        return ""

    raw_url = str(raw_url).strip()
    base_url = getattr(settings, "acestep_api_url", "http://127.0.0.1:8101").rstrip("/")

    if raw_url.startswith(("http://", "https://", "/outputs/", "/uploads/")):
        return raw_url


    if raw_url.startswith("/v1/audio"):
        return f"{base_url}{raw_url}"

    if raw_url.startswith("v1/audio"):
        return f"{base_url}/{raw_url}"

    # Windows absolute path or normal filesystem path
    if re.match(r"^[A-Za-z]:\\", raw_url) or raw_url.startswith("/"):
        return f"{base_url}/v1/audio?path={quote(raw_url, safe='')}"

    # Fallback: treat as ACE-Step audio path
    return f"{base_url}/v1/audio?path={quote(raw_url, safe='')}"

@router.post("/generate")
async def acestep_generate(request: AceStepRequest):
    # Handle source audio localization
    if request.src_audio_path:
        if request.src_audio_path.startswith("http"):
            parsed = urlparse(request.src_audio_path)
            # Resolve relative to backend if local
            if parsed.netloc == "localhost:8100" or not parsed.netloc:
                local_path = resolve_web_path(parsed.path)
                if local_path and os.path.exists(local_path):
                    request.src_audio_path = str(local_path)
        elif not os.path.isabs(request.src_audio_path):
            # Try to resolve as local relative path
            local_path = settings.upload_dir / request.src_audio_path
            if os.path.exists(local_path):
                request.src_audio_path = str(local_path)

    # Handle reference audio localization
    if request.reference_audio_path:
        if request.reference_audio_path.startswith("http"):
            parsed = urlparse(request.reference_audio_path)
            if parsed.netloc == "localhost:8100" or not parsed.netloc:
                local_path = resolve_web_path(parsed.path)
                if local_path and os.path.exists(local_path):
                    request.reference_audio_path = str(local_path)
        elif not os.path.isabs(request.reference_audio_path):
            local_path = settings.upload_dir / request.reference_audio_path
            if os.path.exists(local_path):
                request.reference_audio_path = str(local_path)

    logger.info(f"Starting ACE-Step generation: model={request.model}, type={request.task_type}, prompt={request.prompt[:50]}...")
    result = acestep_service.release_task(
        request.prompt, request.lyrics, thinking=request.thinking,
        inference_steps=request.inference_steps, batch_size=request.batch_size,
        audio_duration=request.duration, vocal_language=request.language,
        model=request.model, sample_mode=request.sample_mode,
        sample_query=request.sample_query, seed=request.seed,
        task_type=request.task_type, audio_cover_strength=request.audio_cover_strength,
        repainting_start=request.repainting_start, repainting_end=request.repainting_end,
        src_audio_path=request.src_audio_path, use_adg=request.use_adg,
        reference_audio_path=request.reference_audio_path, track_name=request.track_name,
        shift=request.shift, infer_method=request.infer_method,
        guidance_scale=request.guidance_scale,
        bpm=request.bpm, key_scale=request.key_scale, time_signature=request.time_signature
    )
    if "error" in result and result["error"]:
        logger.error(f"ACE-Step generation error: {result['error']}")
        # P2: Use 503 if starting up or explicitly specified by service
        status_code = result.get("code", 500)
        if "starting up" in result["error"].lower() or "loading" in result["error"].lower():
            status_code = 503
        raise HTTPException(status_code=status_code, detail=result["error"])
    
    # Normalize response shape for frontend
    # Expected: { "task_id": "..." }
    task_id = result.get("task_id") or (result.get("data", {}) if isinstance(result.get("data"), dict) else {}).get("task_id")
    logger.info(f"ACE-Step task created: {task_id}")
    
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
    Robustly handles JSON string, list, and dictionary result formats.
    """
    result = acestep_service.query_result(task_id)
    
    if not result:
        # Check local task store fallback
        if task_id in tasks:
            result = tasks[task_id]
        else:
            raise HTTPException(status_code=404, detail="Task not found")
    
    # Map status from external service (raw_status is int) or local (status is str)
    raw_status = result.get("status")
    if isinstance(raw_status, int):
        if raw_status == 1:
            status = "completed"
        elif raw_status in [-1, 2]:
            status = "failed"
        else:
            status = "processing"
    else:
        status = raw_status or "processing"

    
    # Normalize output files for frontend
    output_files = []

    if status == "completed":
        res_data = result.get("result")

        if isinstance(res_data, str):
            try:
                res_data = json.loads(res_data)
            except Exception:
                try:
                    res_data = ast.literal_eval(res_data)
                except Exception as e:
                    logger.warning(f"Failed to parse ACE-Step result: {e}, raw={res_data[:500] if isinstance(res_data, str) else res_data}")

        files = []

        if isinstance(res_data, list):
            files = res_data

        elif isinstance(res_data, dict):
            # Check for nested result first
            if "result" in res_data:
                nested = res_data["result"]
                if isinstance(nested, list):
                    files = nested
                elif isinstance(nested, dict):
                    files = [nested]
                elif isinstance(nested, str):
                    try:
                        nested = json.loads(nested)
                    except Exception:
                        try:
                            nested = ast.literal_eval(nested)
                        except Exception:
                            nested = None
                    if isinstance(nested, list):
                        files = nested
                    elif isinstance(nested, dict):
                        files = [nested]

            if not files and "data" in res_data:
                data = res_data["data"]

                if isinstance(data, list):
                    files = data
                elif isinstance(data, dict):
                    files = (
                        data.get("output_files")
                        or data.get("files")
                        or data.get("audios")
                        or []
                    )

            elif "files" in res_data:
                files = res_data.get("files") or []

            elif "merged_url" in res_data:
                files = [{"url": res_data["merged_url"], "label": "Merged Output"}]

            elif "vocals_url" in res_data:
                files = [{"url": res_data["vocals_url"], "label": "Vocals", "type": "vocals"}]
                if "instrumental_url" in res_data:
                    files.append({"url": res_data["instrumental_url"], "label": "Instrumental", "type": "instrumental"})
            
            else:
                # Single dict output case
                files = [res_data]

        # Step 1: Initial normalization (convert everything to dicts with labels)
        for f in files:
            raw = None
            label = "Generated Audio"
            file_type = None

            if isinstance(f, str):
                raw = f
            elif isinstance(f, dict):
                raw = (
                    f.get("url")
                    or f.get("file")
                    or f.get("audio_url")
                    or f.get("audio")
                    or f.get("path")
                    or f.get("output")
                )
                label = f.get("label") or f.get("name") or f.get("filename") or label
                file_type = f.get("type")

            if raw:
                item = {
                    "url": normalize_acestep_audio_url(str(raw)),
                    "label": label
                }
                if file_type:
                    item["type"] = file_type
                output_files.append(item)

        # Step 2: Localization (Copy to local outputs folder to prevent link expiration)
        task_output_dir = ACESTEP_LOCAL_DIR / task_id
        localized_results = []
        
        for idx, item in enumerate(output_files):
            url = item["url"]
            actual_path = None
            if "path=" in url:
                try:
                    actual_path = url.split("path=")[1]
                    actual_path = unquote(actual_path)
                except: pass
            elif url.startswith("/") or re.match(r"^[A-Za-z]:\\", url):
                actual_path = url
            
            if actual_path and os.path.exists(actual_path):
                try:
                    task_output_dir.mkdir(parents=True, exist_ok=True)
                    src_path = Path(actual_path)
                    src_ext = src_path.suffix.lower()
                    
                    local_filename = f"generated_{idx}.mp3"
                    local_dest = task_output_dir / local_filename
                    
                    if not local_dest.exists():
                        if src_ext == ".mp3":
                            shutil.copy2(src_path, local_dest)
                        else:
                            try:
                                transcode_to_mp3(src_path, local_dest)
                            except Exception as trans_err:
                                # P1: Don't fake .mp3 if transcode fails. Outer catch will handle.
                                logger.error(f"Transcode failed during localization: {trans_err}")
                                raise
                    
                    item["url"] = f"/outputs/acestep_generated/{task_id}/{local_filename}"
                    item["format"] = local_filename.split(".")[-1]
                except Exception as e:
                    logger.error(f"Failed to localize file {actual_path}: {e}")
            
            localized_results.append(item)
            
        output_files = localized_results

        if not output_files:
            logger.error(f"ACE-Step completed but no output files parsed. task_id={task_id}")

    logger.debug(f"Task {task_id} status: {status}, files: {len(output_files)}")

    # Pass real generation progress through to the UI (ACE-Step reports 0..1).
    if status == "completed":
        progress_pct = 100
    else:
        try:
            progress_pct = int(max(0.0, min(1.0, float(result.get("progress") or 0.0))) * 100)
        except (TypeError, ValueError):
            progress_pct = 0

    return {
        "task_id": task_id,
        "status": status,
        "progress": progress_pct,
        "stage": result.get("stage"),
        "output_files": output_files,
        "result": result.get("result"),
        "error": result.get("error")
    }

@router.post("/separate")
async def acestep_separate(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    try:
        # Save uploaded file
        ext = Path(file.filename or "").suffix or ".mp3"
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
        # Handle source audio localization
        file_url = request.file_url
        if file_url.startswith("http"):
            parsed = urlparse(file_url)
            if parsed.netloc == "localhost:8100" or not parsed.netloc:
                local_path = resolve_web_path(parsed.path)
            else:
                local_path = await download_audio_from_url(file_url, ACESTEP_SOURCE_DIR)
        else:
            local_path = resolve_web_path(file_url)
            
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
        
        if not inst_path or not inst_path.exists():
            raise HTTPException(status_code=404, detail="Instrumental file not found")
        if not vox_path or not vox_path.exists():
            raise HTTPException(status_code=404, detail="Vocals file not found")
        if orig_path and not orig_path.exists():
            orig_path = None
        
        ref_suffix = Path(reference_audio.filename or "").suffix or ".wav"
        ref_path = ACESTEP_SOURCE_DIR / f"ref_{uuid.uuid4().hex[:8]}{ref_suffix}"
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-vocals-overlay")
async def acestep_generate_vocals_overlay(request: VocalOverlayRequest, background_tasks: BackgroundTasks):
    """Add AI singing to an instrumental while keeping the original instrumental
    byte-exact as the mix base. Returns a task_id polled via /task/{task_id}."""
    raw = request.instrumental_url
    inst_path = None
    if raw:
        if os.path.isabs(raw) and os.path.exists(raw):
            inst_path = Path(raw)
        else:
            inst_path = resolve_web_path(raw)

    if not inst_path or not inst_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Instrumental audio not found. Upload or provide the instrumental first."
        )

    task_id = f"ov_{uuid.uuid4().hex[:8]}"
    tasks[task_id] = {"status": "processing", "progress": 0, "type": "vocal_overlay"}
    background_tasks.add_task(
        run_vocal_overlay_task,
        task_id, inst_path, request.prompt, request.lyrics, request.language,
        request.audio_cover_strength, request.vocal_gain, request.master,
        request.inference_steps, request.guidance_scale, request.shift,
        request.infer_method, request.seed, request.thinking,
    )
    return {"task_id": task_id}

class AnalyzeProfileRequest(BaseModel):
    """Estimate BPM / key / duration of an audio file (for metadata locking)."""
    audio_path: Optional[str] = None
    url: Optional[str] = None


@router.post("/analyze-profile")
async def acestep_analyze_profile(request: AnalyzeProfileRequest):
    """Analyze an uploaded/downloaded audio source and return its musical profile.
    The frontend uses this to auto-fill BPM / key so the LM plan matches the source."""
    try:
        audio_path = None
        if request.audio_path:
            if os.path.isabs(request.audio_path) and os.path.exists(request.audio_path):
                audio_path = Path(request.audio_path)
            else:
                audio_path = resolve_web_path(request.audio_path)
        elif request.url:
            audio_path = await download_audio_from_url(request.url, ACESTEP_SOURCE_DIR)

        if not audio_path or not Path(audio_path).exists():
            raise HTTPException(status_code=404, detail="Audio file not found")

        bpm, key_scale, duration = analyze_music_profile(Path(audio_path))
        return {
            "bpm": bpm,
            "key_scale": key_scale,
            "duration": round(duration, 2) if duration else None,
        }
    except HTTPException:
        raise
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
    except HTTPException:
        raise
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
        if not local_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
            
        y, sr = librosa.load(str(local_path), sr=None, mono=False)
        
        # P2: Auto Trim (Simple silence removal)
        if request.auto_trim:
            y, _ = librosa.effects.trim(y, top_db=30)

        # P1: Fade out (Clamped to avoid crash for short audio)
        total_samples = y.shape[-1] if y.ndim > 1 else len(y)
        fade_samples = min(int(request.fade_duration * sr), total_samples)
        
        if fade_samples > 0:
            fade_curve = np.linspace(1.0, 0.0, fade_samples) ** 2
            if y.ndim > 1:
                # Multiply fade curve across all channels
                y[:, -fade_samples:] *= fade_curve[np.newaxis, :]
            else:
                y[-fade_samples:] *= fade_curve
            
        processed_wav = MERGED_DIR / f"proc_{uuid.uuid4().hex[:8]}.wav"
        sf.write(str(processed_wav), y.T if y.ndim > 1 else y, sr)

        processed_mp3 = transcode_to_mp3(processed_wav)
        
        return {
            "status": "success", 
            "url": f"/outputs/merged/{processed_mp3.name}",
            "wav_url": f"/outputs/merged/{processed_wav.name}"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
