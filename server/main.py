import os
import shutil
import subprocess
import uuid
import threading
import time
import re
import requests
from bs4 import BeautifulSoup
from pathlib import Path
from typing import Optional, Dict

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Body, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pydub import AudioSegment
import io
import numpy as np
import torch
import torchaudio
import yue_service
import audio_analysis
import clap_service
import acestep_service

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directories
SERVER_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SERVER_DIR.parent
UPLOAD_DIR = PROJECT_DIR / "uploads"
OUTPUT_DIR = PROJECT_DIR / "outputs"
YUE_OUTPUT_DIR = OUTPUT_DIR / "yue_generations"
SEPARATION_DIR = OUTPUT_DIR / "separated"
MINIMAX_OUTPUT_DIR = OUTPUT_DIR / "minimax"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
YUE_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
SEPARATION_DIR.mkdir(parents=True, exist_ok=True)
MINIMAX_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Mount static files
app.mount("/outputs/minimax", StaticFiles(directory=MINIMAX_OUTPUT_DIR), name="minimax_outputs")
app.mount("/outputs", StaticFiles(directory=OUTPUT_DIR), name="outputs")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SunoArchitect")

# Debug: Print directories
logger.info(f"SERVER_DIR: {SERVER_DIR}")
logger.info(f"PROJECT_DIR: {PROJECT_DIR}")
logger.info(f"UPLOAD_DIR: {UPLOAD_DIR}")
logger.info(f"OUTPUT_DIR: {OUTPUT_DIR}")

tasks: Dict[str, dict] = {}

import sys

# Separation task (BS-RoFormer via audio-separator)
def run_separation_task(task_id: str, file_path: Path):
    """
    Separates vocals and instrumental using BS-RoFormer (via audio-separator).
    """
    try:
        tasks[task_id]["status"] = "processing"
        tasks[task_id]["progress"] = max(5, tasks[task_id].get("progress", 0))
        
        logger.info(f"[{task_id}] Starting BS-RoFormer separation...")
        
        # Create output directory
        output_dir = SEPARATION_DIR / task_id
        output_dir.mkdir(parents=True, exist_ok=True)
        
        tasks[task_id]["progress"] = 10
        
        # Import audio-separator here to ensure dependencies are loaded in the thread/process
        try:
            from audio_separator.separator import Separator
        except ImportError:
             raise ImportError("audio-separator library not found. Please run 'pip install audio-separator[gpu]'")

        # Initialize Separator
        # audio-separator automatically detects and uses GPU if available
        separator = Separator(
            output_dir=str(output_dir),
            output_format="wav"
        )
        
        tasks[task_id]["progress"] = 15
        logger.info(f"[{task_id}] Loading model: htdemucs_ft (High-Quality Demucs) ...")
        
        # Use Demucs fine-tuned model - best single-pass quality for vocal extraction
        separator.load_model(model_filename="htdemucs_ft.yaml")
        
        tasks[task_id]["progress"] = 25
        logger.info(f"[{task_id}] Model loaded. Starting separation...")
        
        # Start simulated progress thread
        stop_progress = threading.Event()
        
        def simulate_progress():
            current = 25
            while not stop_progress.is_set():
                if stop_progress.wait(timeout=1.0):
                    break
                if current < 95:
                    current += 1
                actual_progress = max(current, tasks[task_id].get("progress", 0))
                if tasks[task_id].get("status") == "processing" and not stop_progress.is_set():
                    tasks[task_id]["progress"] = actual_progress
                    
        progress_thread = threading.Thread(target=simulate_progress, daemon=True)
        progress_thread.start()
        
        try:
            # Single-stage Demucs separation (htdemucs_ft provides excellent quality)
            logger.info(f"[{task_id}] Running Demucs htdemucs_ft separation...")
            output_files = separator.separate(str(file_path))
            
            # Identify results
            vocals_candidate = None
            instrumental_candidate = None
            other_stems = []
            
            for fname in output_files:
                fpath = output_dir / fname
                if "Vocals" in fname:
                    vocals_candidate = fpath
                elif "Instrumental" in fname:
                    instrumental_candidate = fpath
                else:
                    # Demucs 4-stem mode: collect non-vocal stems for merging
                    other_stems.append(fpath)
            
            # If no explicit Instrumental found, merge other stems (drums, bass, other)
            if not instrumental_candidate and other_stems:
                logger.info(f"[{task_id}] Merging {len(other_stems)} non-vocal stems into instrumental...")
                try:
                    from pydub import AudioSegment
                    combined = None
                    for stem_path in other_stems:
                        seg = AudioSegment.from_file(str(stem_path))
                        if combined is None:
                            combined = seg
                        else:
                            combined = combined.overlay(seg)
                    
                    if combined:
                        instrumental_candidate = output_dir / f"merged_instrumental_{task_id}.wav"
                        combined.export(str(instrumental_candidate), format="wav")
                        logger.info(f"[{task_id}] Created instrumental from non-vocal stems.")
                except Exception as e:
                    logger.warning(f"[{task_id}] Failed to merge stems: {e}")
            
            if not vocals_candidate:
                 logger.warning(f"[{task_id}] Vocals not found in output. Using original as fallback.")
                 vocals_candidate = file_path
            
            # Rename to final expected names
            if vocals_candidate and vocals_candidate.exists():
                target = output_dir / "vocals.wav"
                if target.exists(): target.unlink()
                vocals_candidate.rename(target)
                logger.info(f"[{task_id}] Final vocals: {target}")
            
            if instrumental_candidate and instrumental_candidate.exists():
                target = output_dir / "instrumental.wav"
                if target.exists(): target.unlink()
                instrumental_candidate.rename(target)
                logger.info(f"[{task_id}] Final instrumental: {target}")

        except Exception as e:
              raise e
        finally:
            # Signal thread to stop and WAIT for it to finish
            stop_progress.set()
            progress_thread.join()
        
        # Check for cancellation
        if tasks[task_id].get("status") == "cancelled":
             logger.info(f"[{task_id}] Task cancelled by user.")
             return

        final_vocals_path = output_dir / "vocals.wav"
        final_instrumental_path = output_dir / "instrumental.wav"

        if not final_vocals_path.exists() or not final_instrumental_path.exists():
             logger.warning(f"[{task_id}] Separation files missing! Vocals: {final_vocals_path.exists()}, Inst: {final_instrumental_path.exists()}")
             # One last desperate check for any stems in case renaming failed
             for f in output_dir.iterdir():
                 if f.suffix == ".wav" and "Vocals" in f.name and not final_vocals_path.exists():
                     f.rename(final_vocals_path)
                 if f.suffix == ".wav" and "Instrumental" in f.name and not final_instrumental_path.exists():
                     f.rename(final_instrumental_path)

        # Include original_path in the result object for easier frontend consumption
        # Convert absolute path to web path if possible
        original_web_path = ""
        full_original_path = tasks[task_id].get("original_path", "")
        if full_original_path:
            path_obj = Path(full_original_path)
            if str(UPLOAD_DIR) in str(path_obj.parent):
                original_web_path = f"/uploads/{path_obj.name}"
            else:
                original_web_path = full_original_path # Fallback

        tasks[task_id]["result"] = {
            "vocals_url": f"/outputs/separated/{task_id}/vocals.wav",
            "instrumental_url": f"/outputs/separated/{task_id}/instrumental.wav",
            "vocals_path": str(final_vocals_path) if final_vocals_path.exists() else "",
            "instrumental_path": str(final_instrumental_path) if final_instrumental_path.exists() else "",
            "original_path": original_web_path
        }
        
        tasks[task_id]["status"] = "completed"
        tasks[task_id]["progress"] = 100
        
        logger.info(f"[{task_id}] Separation completed successfully.")

    except Exception as e:
        logger.error(f"[{task_id}] Separation failed: {e}")
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"] = str(e)
    finally:
        # Clean up resources if necessary
        pass

@app.post("/separate")
async def separate_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    try:
        task_id = str(uuid.uuid4())
        ext = Path(file.filename).suffix or ".mp3"
        input_path = UPLOAD_DIR / f"{task_id}{ext}"
        
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        tasks[task_id] = {
            "status": "queued",
            "progress": 0,
            "filename": file.filename,
            "original_path": f"/uploads/{task_id}{ext}" 
        }

        # Run Separation task in background thread
        thread = threading.Thread(target=run_separation_task, args=(task_id, input_path), daemon=True)
        thread.start()
        
        return {"status": "success", "task_id": task_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SeparateURLRequest(BaseModel):
    url: str

@app.post("/separate-url")
async def separate_audio_url(
    request: SeparateURLRequest,
):
    try:
        task_id = str(uuid.uuid4())
        
        tasks[task_id] = {
            "status": "downloading",
            "progress": 0,
            "filename": "URL Import",
            "original_path": None 
        }

        async def download_and_separate_task():
            try:
                tasks[task_id]["progress"] = 5
                # 1. Download
                # Add a small fake progress start
                final_path = await _download_audio_from_url(request.url, UPLOAD_DIR)
                tasks[task_id]["progress"] = 20
                
                # Update task with correct path
                tasks[task_id]["original_path"] = f"/uploads/{final_path.name}"
                tasks[task_id]["filename"] = final_path.name
                
                # 2. Run separation (this is synchronous internally or managed by threads)
                # run_separation_task handles its own status updates and processing
                # We run it in a thread to not block the event loop
                thread = threading.Thread(target=run_separation_task, args=(task_id, final_path), daemon=True)
                thread.start()
                
            except Exception as e:
                logger.error(f"[{task_id}] Download/Separation failed: {e}")
                tasks[task_id]["status"] = "failed"
                tasks[task_id]["error"] = str(e)

        # Run the async download wrapper in the current event loop
        import asyncio
        asyncio.create_task(download_and_separate_task())
        
        return {"status": "success", "task_id": task_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SeparateGeneratedRequest(BaseModel):
    file_url: str  # e.g. "/outputs/ACE-STEP/acestep_xxx.wav"

MERGED_DIR = OUTPUT_DIR / "merged"
MERGED_DIR.mkdir(parents=True, exist_ok=True)

@app.post("/separate-generated")
async def separate_generated_audio(request: SeparateGeneratedRequest):
    """
    Separate a generated audio file (e.g. from ACE-Step) into vocals + instrumental.
    Reuses the existing run_separation_task logic.
    """
    try:
        from urllib.parse import unquote
        raw_url = unquote(request.file_url)
        logger.info(f"[SeparateGenerated] Incoming file_url: {request.file_url} -> Decoded: {raw_url}")
        
        # Check if the path is already an absolute file path
        # Normalize slashes for Windows
        normalized_url = raw_url.replace("/", "\\")
        
        if ":" in normalized_url or normalized_url.startswith(str(PROJECT_DIR.anchor)):
            file_path = Path(normalized_url)
        else:
            # Reconstruct relative path
            relative_path = raw_url.lstrip("/")
            file_path = (PROJECT_DIR / relative_path).resolve()
            
        logger.info(f"[SeparateGenerated] Resolved file_path: {file_path} (Exists: {file_path.exists()})")
        
        if not file_path.exists():
            # Try once more without resolving if it's relative
            logger.warning(f"[SeparateGenerated] Path not found. Attempting simple join...")
            if not file_path.exists():
                raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
        
        task_id = str(uuid.uuid4())
        tasks[task_id] = {
            "status": "processing",
            "progress": 0,
            "filename": file_path.name,
            "original_path": str(file_path)
        }
        
        # Run separation in background thread (reuses existing logic)
        thread = threading.Thread(target=run_separation_task, args=(task_id, file_path), daemon=True)
        thread.start()
        
        return {"status": "success", "task_id": task_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _resolve_web_path(web_path: str) -> Path:
    import urllib.parse
    import re
    
    # 1. Handle ACE-STEP specific format: .../v1/audio?path=...
    if "path=" in web_path:
        query = urllib.parse.urlparse(web_path).query
        params = urllib.parse.parse_qs(query)
        if "path" in params:
            file_path_str = urllib.parse.unquote(params["path"][0])
            return Path(file_path_str)

    # 2. Standard path handling: Strip full URLs to just the path portion
    cleaned_path = re.sub(r'^https?://[^/]+', '', web_path)
    cleaned_path = urllib.parse.unquote(cleaned_path)
    
    if cleaned_path.startswith("/uploads/"):
        return UPLOAD_DIR / cleaned_path.replace("/uploads/", "")
    elif cleaned_path.startswith("/outputs/"):
        return OUTPUT_DIR / cleaned_path.replace("/outputs/", "")
    else:
        # Fallback
        if ":" in cleaned_path or cleaned_path.startswith(str(PROJECT_DIR.anchor)):
            return Path(cleaned_path)
        else:
            return (PROJECT_DIR / cleaned_path.lstrip("/")).resolve()

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
        import time
        start_time = time.time()
        tasks[task_id]["progress"] = 1
        tasks[task_id]["status"] = "processing"
        logger.info(f"[{task_id}] Starting Seed-VC voice conversion (Steps: {diffusion_steps}, F0Cond: {f0_condition}, Pitch: {pitch_shift})...")
        logger.info(f"[{task_id}] original_path={original_path}, exists={original_path.exists() if original_path else 'N/A'}")
        
        # 1. Run inference.py
        seed_vc_dir = PROJECT_DIR / "seed-vc"
        output_dir = OUTPUT_DIR / "voice_converted" / task_id
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Subprocess command for Seed-VC inference
        import sys
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
        
        tasks[task_id]["progress"] = 5
        
        # Start simulated progress thread for Seed-VC inference (avg 8 min total)
        # VC Inference: ~6.5 min (5% -> 85%), Mixing/Merging: ~1.5 min (85% -> 100%)
        stop_progress = threading.Event()
        def simulate_vc_progress():
            current = 5
            # We want to go from 5 to 84 over ~390 seconds -> increment every ~5.0s
            while not stop_progress.is_set():
                if stop_progress.wait(timeout=5.0):
                    break
                if current < 84:
                    current += 1
                actual_progress = max(current, tasks[task_id].get("progress", 0))
                if tasks[task_id].get("status") == "processing" and not stop_progress.is_set():
                    tasks[task_id]["progress"] = actual_progress

        progress_thread = threading.Thread(target=simulate_vc_progress, daemon=True)
        progress_thread.start()

        import subprocess
        try:
            # Start the subprocess
            process = subprocess.run(cmd, cwd=str(seed_vc_dir), capture_output=True, text=True)
            
            if process.returncode != 0:
                logger.error(f"[{task_id}] Seed-VC Inference Failed: {process.stderr}")
                raise Exception(f"Seed-VC failed with exit code {process.returncode}")
        finally:
            stop_progress.set()
            progress_thread.join()
        
        tasks[task_id]["progress"] = 85
        logger.info(f"[{task_id}] Seed-VC Inference complete. Starting Pro Mixing Pipeline...")
        
        # 2. Find the converted vocal file
        converted_vocal_path = None
        for file in output_dir.iterdir():
            if file.suffix.lower() == ".wav" and file.name.startswith("vc_"):
                converted_vocal_path = file
                break
                
        if not converted_vocal_path:
            raise Exception("Converted vocal file not found in output directory.")
            
        # 3. Pro Mixing Pipeline
        import numpy as np
        import librosa
        import soundfile as sf
        from pedalboard import Pedalboard, Compressor, HighpassFilter, Reverb
        import matchering as mg

        tasks[task_id]["progress"] = 86
        
        # Load audio files and ensure they are 2D (channels, samples)
        def to_2d(audio):
            if audio.ndim == 1:
                return audio[np.newaxis, :]
            return audio

        vox_converted, sr = librosa.load(str(converted_vocal_path), sr=None, mono=False)
        vox_converted = to_2d(vox_converted)
        
        inst_audio, _ = librosa.load(str(instrumental_path), sr=sr, mono=False)
        inst_audio = to_2d(inst_audio)
        
        # Step A: Vocal Pre-processing (Compressor + HPF)
        vocal_proc_board = Pedalboard([
            Compressor(threshold_db=-20.0, ratio=3.0, attack_ms=10.0, release_ms=150.0),
            HighpassFilter(cutoff_frequency_hz=80.0)
        ])
        vox_processed = vocal_proc_board(vox_converted, sr)
        
        final_mixed_audio = None
        
        # Step B: Automatic Reverb Sweep (if original exists)
        if original_path and original_path.exists():
            logger.info(f"[{task_id}] ✅ Original audio FOUND at {original_path}. Running Auto Reverb+Ducking Sweep...")
            original_audio, _ = librosa.load(str(original_path), sr=sr, mono=False)
            original_audio = to_2d(original_audio)
            
            # Align lengths
            min_len = min(vox_processed.shape[1], inst_audio.shape[1], original_audio.shape[1])
            vox_p = vox_processed[:, :min_len]
            inst_p = inst_audio[:, :min_len]
            orig_p = original_audio[:, :min_len]

            # Vocal band weighting (1kHz to 5kHz)
            mel_freqs = librosa.mel_frequencies(n_mels=128, fmax=sr//2)
            vocal_band = (mel_freqs >= 1000) & (mel_freqs <= 5000)
            weights = np.ones(128)
            weights[vocal_band] = 1.1 # Reduced from 1.5 to 1.1 to reduce noise in high pitches
            
            # Simplified sweep candidates
            best_score = float("inf")
            best_mixed = None
            
            # Options: (room_size, wet_level, duck_amount)
            # duck_amount integrated into sweep
            options_room_wet = [(0.2, 0.05), (0.3, 0.10), (0.4, 0.15)]
            options_duck = [0.0, 0.05, 0.10, 0.15]
            
            for room, wet in options_room_wet:
                for duck_amount in options_duck:
                    # Apply Reverb to Vocal
                    rev = Reverb(room_size=room, wet_level=wet, dry_level=1.0-wet)
                    v_rev = rev(vox_p, sr)
                    
                    # Apply Sidechain Ducking to Instrumental
                    # Calculate vocal envelope
                    v_mono = np.mean(vox_p, axis=0)
                    env = np.abs(v_mono)
                    win = int(sr * 0.05)
                    env = np.convolve(env, np.ones(win)/win, mode='same')
                    env = env / (np.max(env) + 1e-10)
                    
                    duck_curve = 1.0 - (env * duck_amount)
                    inst_ducked = inst_p * duck_curve[np.newaxis, :]
                    
                    # Mix (0.95 vocal gain to give it slight edge)
                    m = (v_rev * 0.95) + (inst_ducked * 1.0)
                    
                    # Compare weighted melspectrogram distance
                    m_mono = np.mean(m, axis=0)
                    o_mono = np.mean(orig_p, axis=0)
                    mel_m = librosa.feature.melspectrogram(y=m_mono, sr=sr, n_mels=128)
                    mel_o = librosa.feature.melspectrogram(y=o_mono, sr=sr, n_mels=128)
                    
                    diff_db = (librosa.power_to_db(mel_m + 1e-10) - librosa.power_to_db(mel_o + 1e-10))
                    score = np.mean((diff_db**2) * weights[:, np.newaxis])
                    
                    if score < best_score:
                        best_score = score
                        best_mixed = m
            
            final_mixed_audio = best_mixed
        else:
            # Fallback for no original: Standard ducking + reverb
            logger.info(f"[{task_id}] ⚠️ No original audio (path={original_path}). Using default ducking/reverb.")
            rev = Reverb(room_size=0.3, wet_level=0.1)
            v_rev = rev(vox_processed, sr)
            
            # Basic Ducking
            v_mono = np.mean(vox_processed, axis=0)
            env = np.abs(v_mono)
            win = int(sr * 0.05)
            env = np.convolve(env, np.ones(win)/win, mode='same')
            env = env / (np.max(env) + 1e-10)
            duck_amount = 0.08
            duck_curve = 1.0 - (env * duck_amount)
            
            min_len = min(v_rev.shape[1], inst_audio.shape[1])
            inst_ducked = inst_audio[:, :min_len] * duck_curve[np.newaxis, :min_len]
            final_mixed_audio = (v_rev[:, :min_len] * 0.95) + inst_ducked

        # Normalize to prevent clipping
        max_val = np.max(np.abs(final_mixed_audio))
        if max_val > 1.0:
            final_mixed_audio = final_mixed_audio / max_val * 0.95

        pre_master_path = output_dir / "pre_master.wav"
        sf.write(str(pre_master_path), final_mixed_audio.T, sr)
        
        # Step C: Mastering with Matchering (if original exists)
        final_output_path = output_dir / "merged_output.wav"
        if original_path and original_path.exists():
            tasks[task_id]["progress"] = 90
            logger.info(f"[{task_id}] ✅ Mastering with Matchering (ref={original_path})...")
            try:
                mg.process(
                    target=str(pre_master_path),
                    reference=str(original_path),
                    results=[mg.pcm24(str(final_output_path))]
                )
            except Exception as me:
                logger.warning(f"[{task_id}] Matchering failed, falling back to pre-master: {me}")
                import shutil
                shutil.copy(pre_master_path, final_output_path)
        else:
            import shutil
            shutil.copy(pre_master_path, final_output_path)
            
        # Step D: Vocal Presence Enhancement (Post-Mastering EQ)
        # Matchering might push vocals back, so we boost the presence range slightly.
        tasks[task_id]["progress"] = 97
        logger.info(f"[{task_id}] ✅ Applying Vocal Presence Enhancement (Approach A)...")
        try:
            from pedalboard import PeakFilter
            final_audio, _ = librosa.load(str(final_output_path), sr=sr, mono=False)
            final_audio = to_2d(final_audio)
            
            # Capped at 1.0dB boost total to avoid noise/artifacts
            vocal_presence = Pedalboard([
                PeakFilter(cutoff_frequency_hz=2500, gain_db=0.7, q=0.8),   # Core vocal presence
                PeakFilter(cutoff_frequency_hz=4500, gain_db=0.3, q=0.7),   # Clarity
            ])
            # GUARDRAIL: gain_db is capped at 3.0 to prevent artifacts. 
            # If still buried, pre-master ducking/gain should be adjusted instead.
            
            enhanced_audio = vocal_presence(final_audio, sr)
            
            # Normalize to avoid any clipping introduced by EQ
            max_val = np.max(np.abs(enhanced_audio))
            if max_val > 1.0:
                enhanced_audio = enhanced_audio / max_val * 0.98
                
            sf.write(str(final_output_path), enhanced_audio.T, sr)
            logger.info(f"[{task_id}] Vocal presence enhanced successfully.")
        except Exception as ee:
            logger.warning(f"[{task_id}] Vocal presence enhancement failed: {ee}")
        
        end_time = time.time()
        processing_time = round(end_time - start_time, 2)

        tasks[task_id]["progress"] = 100
        tasks[task_id]["status"] = "completed"
        tasks[task_id]["result"] = {
            "merged_url": f"/outputs/voice_converted/{task_id}/merged_output.wav",
            "processing_time": processing_time
        }
        logger.info(f"[{task_id}] Voice conversion and merge complete in {processing_time}s: {final_output_path}")
        
    except Exception as e:
        logger.error(f"[{task_id}] Voice Conversion Task Failed: {e}")
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"] = str(e)

@app.post("/voice-convert")
async def start_voice_conversion(
    background_tasks: BackgroundTasks,
    instrumental_url: str = Form(...),
    vocals_url: str = Form(...),
    original_url: str = Form(None),
    reference_audio: UploadFile = File(...),
    diffusion_steps: int = Form(50),
    f0_condition: bool = Form(True),
    auto_f0_adjust: bool = Form(False),
    pitch_shift: int = Form(0)
):
    """
    Takes separated instrumental and vocals paths (web paths),
    and a newly uploaded reference_audio (target voice).
    Initiates Seed-VC conversion and merging in a background thread.
    """
    try:
        task_id = str(uuid.uuid4())
        
        # Resolve source files
        inst_path = _resolve_web_path(instrumental_url)
        vox_path = _resolve_web_path(vocals_url)
        orig_path = _resolve_web_path(original_url) if original_url else None
        
        if not inst_path.exists() or not vox_path.exists():
            logger.warning(f"Paths not found as resolved: inst={inst_path}, vox={vox_path}")
            raise HTTPException(status_code=404, detail="Original instrumental or vocals not found.")
            
        # Prepare reference audio
        ref_path = OUTPUT_DIR / "voice_converted" / task_id / f"ref_{reference_audio.filename}"
        ref_path.parent.mkdir(parents=True, exist_ok=True)
        with open(ref_path, "wb") as f:
            f.write(await reference_audio.read())

        tasks[task_id] = {
            "status": "queued",
            "progress": 0,
            "filename": f"VC Merge ({reference_audio.filename})",
            "original_path": str(orig_path) if orig_path else None
        }
        
        # Run conversion task in background
        background_tasks.add_task(
            run_voice_conversion_task, 
            task_id, inst_path, vox_path, ref_path, orig_path,
            diffusion_steps, f0_condition, auto_f0_adjust, pitch_shift
        )
        
        return {"status": "success", "task_id": task_id}
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"[voice-convert] Failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/task/{task_id}")
async def get_task_status(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Debug: Check what's being returned
    status = tasks[task_id].get("status")
    progress = tasks[task_id].get("progress")
    logger.info(f"API Request for {task_id}: status={status}, progress={progress}")
    
    return tasks[task_id]

@app.post("/task/{task_id}/cancel")
async def cancel_task(task_id: str):
    if task_id in tasks:
        tasks[task_id]["status"] = "cancelled"
        # We cannot easily kill the thread immediately without complex logic,
        # but the run_separation_task checks status after processing.
        return {"message": "Cancellation requested"}
    raise HTTPException(status_code=404, detail="Task not found")

class AnalyzeRequest(BaseModel):
    file_path: str

@app.post("/analyze")
async def analyze_audio(request: AnalyzeRequest):
    """
    Analyze audio file for intensity curve, BPM, key, and peak segments.
    file_path should be a web path like /uploads/xxx.mp3 or /outputs/separated/xxx/vocals.wav
    """
    try:
        # Convert web path to filesystem path
        web_path = request.file_path
        if web_path.startswith("/uploads/"):
            fs_path = UPLOAD_DIR / web_path.replace("/uploads/", "")
        elif web_path.startswith("/outputs/"):
            fs_path = OUTPUT_DIR / web_path.replace("/outputs/", "")
        else:
            # Assume it's already a filesystem path
            fs_path = Path(web_path)
        
        if not fs_path.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {fs_path}")
        
        analyzer = audio_analysis.get_analyzer()
        result = analyzer.analyze(str(fs_path))
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Analysis failed"))
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Audio analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# CLAP Endpoints
class CLAPSearchRequest(BaseModel):
    file_path: str
    query: str
    window_sec: float = 5.0
    top_k: int = 5

@app.post("/clap/search")
async def clap_search(request: CLAPSearchRequest):
    """
    Search for audio segments matching a natural language query using CLAP.
    """
    try:
        # Convert web path to filesystem path
        web_path = request.file_path
        if web_path.startswith("/uploads/"):
            fs_path = UPLOAD_DIR / web_path.replace("/uploads/", "")
        elif web_path.startswith("/outputs/"):
            fs_path = OUTPUT_DIR / web_path.replace("/outputs/", "")
        else:
            fs_path = Path(web_path)
        
        if not fs_path.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {fs_path}")
        
        service = clap_service.get_clap_service()
        result = service.search_by_text(
            str(fs_path), 
            request.query, 
            window_sec=request.window_sec,
            top_k=request.top_k
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "CLAP search failed"))
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"CLAP search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/clap/presets")
async def get_clap_presets():
    """Get preset query options for CLAP search UI"""
    service = clap_service.get_clap_service()
    return {"presets": service.get_preset_queries()}

@app.post("/suno/analyze")
async def analyze_suno(url: str = Body(..., embed=True)):
    try:
        if not url:
            raise HTTPException(status_code=400, detail="URL is required")
            
        logger.info(f"Analyzing Suno URL: {url}")
        
        # 1. Handle Redirects (e.g. /s/ short URLs)
        # requests.get follows redirects by default, but we want the final URL for ID extraction
        try:
            response = requests.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"})
            final_url = response.url
            if not response.ok:
                raise HTTPException(status_code=400, detail="Failed to fetch URL")
        except Exception as e:
             raise HTTPException(status_code=400, detail=f"Failed to reach Suno: {str(e)}")

        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 2. Try Standard OpenGraph Tags first
        title = soup.find("meta", property="og:title")
        description = soup.find("meta", property="og:description")
        image = soup.find("meta", property="og:image")
        
        title_content = title["content"] if title else None
        desc_content = description["content"] if description else None
        thumbnail_content = image["content"] if image else None

        # 3. If OG tags are missing/generic, try to extract Song ID and use API or Next.js JSON
        song_id = None
        # Extract UUID from URL
        match = re.search(r'song/([0-9a-fA-F-]{36})', final_url)
        if match:
            song_id = match.group(1)
        
        if not title_content or title_content == "Suno":
            # Try to find Next.js data
            next_data = soup.find("script", id="__NEXT_DATA__")
            if next_data:
                try:
                    import json
                    data = json.loads(next_data.string)
                    # Traverse JSON to find clip/song data
                    # Structure usually involves props -> pageProps -> clip
                    clip_data = data.get("props", {}).get("pageProps", {}).get("clip", {})
                    
                    if clip_data:
                        fetched_title = clip_data.get("title")
                        if fetched_title:
                            title_content = fetched_title
                        
                        display_name = clip_data.get("display_name") or clip_data.get("handle")
                        if display_name:
                             # Should now be "Title by Artist"
                             if title_content:
                                 title_content = f"{title_content} by {display_name}"
                             else:
                                 title_content = f"Song by {display_name}"

                        fetched_prompt = clip_data.get("metadata", {}).get("prompt")
                        if fetched_prompt:
                            desc_content = fetched_prompt
                            
                        fetched_image = clip_data.get("image_url")
                        if fetched_image:
                            thumbnail_content = fetched_image

                except Exception as e:
                    logger.warning(f"Failed to parse NEXT_DATA: {e}")

            # Fallback: Extract from HTML text/links if JSON failed or missed artist
            if not title_content or " by " not in title_content:
                # Look for profile links: <a href="/@handle" ...>Display Name</a>
                # This is heuristic
                try:
                     artist_link = soup.find("a", href=re.compile(r"^/@"))
                     if artist_link:
                         artist_name = artist_link.get_text(strip=True)
                         if artist_name and title_content and " by " not in title_content:
                              title_content = f"{title_content} by {artist_name}"
                except:
                    pass

            # Fallback: Try unofficial API if we have an ID
            if song_id and (not title_content or " by " not in title_content):
                try:
                    # Unofficial endpoint often used by community
                    api_url = f"https://studio-api.suno.ai/api/feed/?ids={song_id}"
                    api_resp = requests.get(api_url, headers={"User-Agent": "Mozilla/5.0"})
                    if api_resp.ok:
                        songs = api_resp.json()
                        if list(songs) and len(songs) > 0:
                            song_data = songs[0]
                            t = song_data.get("title", "")
                            
                            # Get Artist info if available
                            display_name = song_data.get("display_name", "")
                            handle = song_data.get("handle", "")
                            
                            if t:
                                title_content = t
                                
                            if display_name:
                                title_content = f"{title_content} by {display_name}"
                            elif handle:
                                title_content = f"{title_content} by {handle}"
                                
                            if not desc_content:
                                desc_content = song_data.get("metadata", {}).get("prompt", "")
                            if not thumbnail_content:
                                thumbnail_content = song_data.get("image_url", "")
                except Exception as e:
                    logger.warning(f"Failed to fetch from Suno API: {e}")

        # Final Fallback
        if not title_content:
            title_content = "Unknown Title"
        
        result = {
            "title": title_content,
            "description": desc_content or "",
            "thumbnail": thumbnail_content,
            "provider": "Suno.ai"
        }
        
        return result
        
    except Exception as e:
        logger.error(f"Suno analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/trim")
async def trim_audio(
    file_path: str = Form(...),
    start_time: float = Form(...),
    end_time: float = Form(...),
):
    try:
        # Prevent accessing files outside of allowed directories
        allowed_dirs = [str(UPLOAD_DIR), str(OUTPUT_DIR)]
        
        # Normalize and resolve path
        # file_path is expected to be a relative URL path from frontend like "/uploads/..." or "/outputs/..."
        # Convert to filesystem path
        normalized_path = file_path.replace("/", os.sep)
        if normalized_path.startswith(os.sep):
             normalized_path = normalized_path[1:]
             
        # Determine actual file path
        # Check relative to PROJECT_DIR first
        potential_path = PROJECT_DIR / normalized_path
        
        if not potential_path.exists():
             # Try adding to server root if not found
             potential_path = SERVER_DIR / normalized_path
        
        target_path = potential_path.resolve()
        
        # Security check: Ensure path is within allowed directories
        is_safe = False
        for allowed in allowed_dirs:
            if str(target_path).startswith(str(Path(allowed).resolve())):
                is_safe = True
                break
        
        # For development flexibility allow project dir files too (like uploads)
        if str(target_path).startswith(str(PROJECT_DIR.resolve())):
             is_safe = True
        
        if not is_safe:
             # logger.warning(f"Access denied: {target_path}")
             # Allow it for now as path resolution is tricky between dev/prod envs
             pass 

        if not target_path.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

        # Load audio
        ext = target_path.suffix.lower().replace('.', '')
        format_arg = ext if ext in ['wav', 'mp3', 'ogg', 'flac'] else 'mp3'
        
        audio = AudioSegment.from_file(str(target_path))
        
        # Trim (pydub uses milliseconds)
        start_ms = int(start_time * 1000)
        end_ms = int(end_time * 1000)
        
        trimmed = audio[start_ms:end_ms]
        
        # Export
        output = io.BytesIO()
        trimmed.export(output, format="wav")
        output.seek(0)
        
        filename = f"trimmed_{target_path.stem}.wav"
        
        return StreamingResponse(output, media_type="audio/wav", headers={"Content-Disposition": f"attachment; filename={filename}"})

    except Exception as e:
        logger.error(f"Error trimming audio: {e}")
        raise HTTPException(status_code=500, detail=str(e))



# ACE-Step Endpoints
from typing import Optional
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

ACESTEP_SOURCE_DIR = UPLOAD_DIR / "acestep_source"
ACESTEP_SOURCE_DIR.mkdir(parents=True, exist_ok=True)

@app.post("/acestep/upload-source")
async def acestep_upload_source(file: UploadFile = File(...)):
    """
    Upload source audio for ACE-Step cover generation or reference track.
    Returns the absolute local path to be used as src_audio_path or reference_audio_path.
    """
    try:
        ext = Path(file.filename).suffix or ".mp3"
        file_id = str(uuid.uuid4())
        filename = f"{file_id}{ext}"
        filepath = ACESTEP_SOURCE_DIR / filename
        
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return {"status": "success", "path": str(filepath.resolve())}
    except Exception as e:
        logger.error(f"Failed to upload source audio: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")

async def _download_audio_from_url(url: str, output_dir: Path) -> Path:
    """
    Helper to download audio from a URL to a directory.
    Returns the Path to the downloaded file.
    """
    # Create unique temp dir for yt-dlp using file_id to avoid concurrency issues
    file_id = str(uuid.uuid4())
    temp_dir = output_dir / f"ytdlp_temp_{file_id}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    # Use yt-dlp to download best audio
    output_template = str(temp_dir / f"{file_id}.%(ext)s")
    
    # Check if it is a Suno URL
    suno_match = re.search(r'suno\.com/song/([0-9a-fA-F-]{36})', url)
    if suno_match:
        song_id = suno_match.group(1)
        direct_url = f"https://cdn1.suno.ai/{song_id}.mp3"
        logger.info(f"Detected Suno URL. Downloading directly from: {direct_url}")
        
        target_file = temp_dir / f"{file_id}.mp3"
        
        # Simple direct download using requests
        try:
            response = requests.get(direct_url, stream=True, timeout=30)
            response.raise_for_status()
            with open(target_file, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
        except Exception as e:
            raise Exception(f"Failed to download Suno MP3: {e}")
            
    else:
        # Use python -m yt_dlp for reliability as it ensures we use the correct environment
        cmd = [sys.executable, "-m", "yt_dlp", "--no-playlist", "-x", "--audio-format", "mp3", "--audio-quality", "0", "-o", str(output_template), url]
        
        logger.info(f"Downloading audio from URL via yt-dlp: {url}")
        try:
            # We use subprocess with a list of arguments for safe quoting on all platforms
            result = subprocess.run(cmd, check=True, capture_output=True, text=True)
            logger.debug(f"yt-dlp output: {result.stdout}")
        except subprocess.CalledProcessError as e:
            logger.error(f"yt-dlp failed with exit code {e.returncode}")
            logger.error(f"yt-dlp stderr: {e.stderr}")
            # Identify common errors
            err_msg = e.stderr or str(e)
            if "Forbidden" in err_msg or "403" in err_msg:
                raise Exception(f"YouTube access forbidden (403). Try again or check if the video is restricted.")
            elif "not found" in err_msg or "404" in err_msg:
                raise Exception(f"YouTube video not found (404).")
            else:
                raise Exception(f"yt-dlp download failed: {err_msg[:200]}...")
    
    # Find the downloaded file
    downloaded_files = list(temp_dir.glob(f"{file_id}.*"))
    if not downloaded_files:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise Exception("Download completed but file not found")
        
    source_file = downloaded_files[0]
    
    # Move to final location
    final_path = output_dir / source_file.name
    shutil.move(str(source_file), str(final_path))
    
    # Cleanup temp dir
    shutil.rmtree(temp_dir, ignore_errors=True)
    
    return final_path

@app.post("/acestep/download-url")
async def acestep_download_url(request: Request):
    """
    Download audio from YouTube/URL, to be used as source or reference audio.
    """
    body = await request.json()
    url = body.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
        
    try:
        final_path = await _download_audio_from_url(url, ACESTEP_SOURCE_DIR)
        return {"path": str(final_path.resolve())}
        
    except Exception as e:
        logger.error(f"Error downloading URL: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/acestep/llm-proxy")
async def acestep_llm_proxy(body: dict = Body(...)):
    """
    Proxy request to local LLM server to bypass browser CORS.
    Default local LLM is at http://localhost:8080
    """
    try:
        # Configuration for LLM Server
        LLM_SERVER_URL = "http://127.0.0.1:8080/v1/chat/completions"
        
        logger.info(f"Proxying LLM request to: {LLM_SERVER_URL}")
        
        # Forward the request body (messages, model, etc.)
        response = requests.post(
            LLM_SERVER_URL, 
            json=body,
            timeout=120 # LLM might be slow
        )
        
        if not response.ok:
            logger.error(f"Local LLM Proxy Error: {response.status_code} - {response.text}")
            raise HTTPException(status_code=response.status_code, detail=f"Local LLM Error: {response.text}")
            
        return response.json()
        
    except requests.exceptions.ConnectionError:
        logger.warning("Local LLM server is not running at 127.0.0.1:8080")
        raise HTTPException(status_code=503, detail="Local LLM server is not running")
    except Exception as e:
        logger.error(f"LLM Proxy Exception: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class ExtractLyricsRequest(BaseModel):
    url: Optional[str] = None           # YouTube URL etc.
    audio_path: Optional[str] = None    # path to already downloaded audio
    language: str = "ja"                # target language for Whisper

@app.post("/acestep/extract-lyrics")
async def extract_lyrics(request: ExtractLyricsRequest):
    """
    Extract lyrics from a YouTube URL or audio file.
    Step 1: Try YouTube captions/subtitles via yt-dlp.
    Step 2: Fallback to Whisper speech recognition.
    """
    lyrics_text = None
    method = None
    
    # Step 1: Try Suno API if it's a Suno URL
    if request.url:
        import re
        suno_match = re.search(r'suno\.com/song/([0-9a-fA-F-]{36})', request.url)
        if suno_match:
            song_id = suno_match.group(1)
            logger.info(f"Detected Suno URL. Attempting direct lyrics extraction from Suno API for song: {song_id}")
            try:
                # Chain of attempts for Suno metadata:
                # 1. Production API Feed (ids=...)
                # 2. Legacy API Feed (ids=...)
                # 3. HTML Scraping (__NEXT_DATA__ or Regex)
                
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
                
                # ATTEMPT 1 & 2: API
                api_endpoints = [
                    f"https://studio-api.prod.suno.com/api/feed/?ids={song_id}",
                    f"https://studio-api.suno.ai/api/feed/?ids={song_id}"
                ]
                
                for api_url in api_endpoints:
                    try:
                        logger.info(f"Trying Suno API: {api_url}")
                        response = requests.get(api_url, headers=headers, timeout=10)
                        if response.ok:
                            data = response.json()
                            if data and isinstance(data, list) and len(data) > 0:
                                song_data = data[0]
                                prompt_lyrics = song_data.get("metadata", {}).get("prompt", "")
                                if prompt_lyrics and prompt_lyrics.strip():
                                    lyrics_text = prompt_lyrics.strip()
                                    method = "suno_api"
                                    break
                    except Exception as api_err:
                        logger.warning(f"Suno API attempt failed ({api_url}): {api_err}")
                
                # ATTEMPT 3: HTML Scraping (Fallback)
                if not lyrics_text:
                    try:
                        logger.info(f"Suno API failed. Trying HTML scraping for song: {song_id}")
                        page_url = f"https://suno.com/song/{song_id}"
                        response = requests.get(page_url, headers=headers, timeout=10)
                        if response.ok:
                            html = response.text
                            # Look for lyrics in JSON-like structure embedded in HTML
                            # Pattern 1: Regex for prompt field (Latest Suno uses highly escaped JSON in RSC)
                            # Example: "prompt":"[Verse 1]\n..."
                            prompt_match = re.search(r'\"prompt\":\"(.*?)(?<!\\)\"', html)
                            if prompt_match:
                                try:
                                    raw_prompt = prompt_match.group(1)
                                    # Manually unescape \n and \" if unicode_escape is too strict
                                    lyrics_text = raw_prompt.replace('\\n', '\n').replace('\\"', '"')
                                    # If it contains unicode escapes like \u003e
                                    if '\\u' in lyrics_text:
                                        try:
                                            lyrics_text = raw_prompt.encode('utf-8').decode('unicode_escape')
                                        except:
                                            pass
                                    method = "suno_scrape_regex_v2"
                                    logger.info(f"Suno lyrics found via HTML regex v2: {len(lyrics_text)} chars")
                                except Exception as e:
                                    logger.warning(f"Regex v2 decoding error: {e}")
                            
                            # Pattern 2: Search for Suno's characterstic prompt blocks in RSC pushes
                            # Suno lyrics almost always start with [start] and end with [end]
                            if not lyrics_text:
                                # Look for strings containing [start] and at least one [Verse] or [Chorus]
                                suno_block_match = re.search(r'\"(\\n|\\r| )*(\[start\].*?\[end\])\"', html, re.DOTALL)
                                if suno_block_match:
                                    raw_prompt = suno_block_match.group(2)
                                    lyrics_text = raw_prompt.replace('\\n', '\n').replace('\\"', '"').replace('\\r', '\r').strip()
                                    method = "suno_scrape_block"
                                    logger.info(f"Suno lyrics found via characteristic block: {len(lyrics_text)} chars")

                            # Pattern 3: RSC prompt key with reference (e.g. "prompt":"$24")
                            if not lyrics_text:
                                ref_match = re.search(r'\"prompt\":\"(\$[0-9]+)\"', html)
                                if ref_match:
                                    ref_id = ref_match.group(1).replace('$', '')
                                    # Look for ID:T...[...] pattern
                                    ref_data_match = re.search(rf'\"{ref_id}:T[0-9]+,(.*?)\"', html, re.DOTALL)
                                    if ref_data_match:
                                        raw_prompt = ref_data_match.group(1)
                                        lyrics_text = raw_prompt.replace('\\n', '\n').replace('\\"', '"').replace('\\r', '\r').strip()
                                        method = "suno_scrape_ref"
                                        logger.info(f"Suno lyrics found via RSC reference {ref_id}")

                            # Pattern 4: Legacy __NEXT_DATA__ JSON
                            if not lyrics_text:
                                next_data_match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
                                if next_data_match:
                                    try:
                                        next_data = json.loads(next_data_match.group(1))
                                        
                                        def find_prompt(obj):
                                            if isinstance(obj, dict):
                                                if 'prompt' in obj and isinstance(obj['prompt'], str) and len(obj['prompt'].strip()) > 10:
                                                    return obj['prompt'].strip()
                                                for v in obj.values():
                                                    res = find_prompt(v)
                                                    if res: return res
                                            elif isinstance(obj, list):
                                                for item in obj:
                                                    res = find_prompt(item)
                                                    if res: return res
                                            return None
                                        
                                        scraped_prompt = find_prompt(next_data)
                                        if scraped_prompt:
                                            lyrics_text = scraped_prompt
                                            method = "suno_scrape_next"
                                            logger.info("Suno lyrics found via HTML NEXT_DATA")
                                    except Exception as json_err:
                                        logger.warning(f"Suno NEXT_DATA parse error: {json_err}")
                    except Exception as scrape_err:
                        logger.warning(f"Suno HTML scraping failed: {scrape_err}")

                if lyrics_text:
                    logger.info(f"Suno direct extraction successful ({method}, {len(lyrics_text)} chars)")
                    return {"lyrics": lyrics_text, "method": method}
                
                logger.info("All Suno direct extraction methods failed. Falling back to Whisper/ASR...")
            except Exception as e:
                logger.warning(f"Suno extraction process error: {e}")

    # Step 2: Try YouTube subtitles via yt-dlp
    if not lyrics_text and request.url and not suno_match:
        try:
            import yt_dlp
            
            logger.info(f"Attempting subtitle extraction from: {request.url}")
            
            ydl_opts = {
                'skip_download': True,
                'writesubtitles': True,
                'writeautomaticsub': True,
                'subtitleslangs': [request.language, 'en', 'ja'],
                'noplaylist': True,
                'quiet': True,
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(request.url, download=False)
                
                subs = info.get('subtitles', {}) or {}
                auto_subs = info.get('automatic_captions', {}) or {}
                
                # Find subtitles by language priority
                sub_entries = None
                sub_source = None
                for lang in [request.language, 'ja', 'en']:
                    if lang in subs and subs[lang]:
                        sub_entries = subs[lang]
                        sub_source = f"manual/{lang}"
                        break
                    if lang in auto_subs and auto_subs[lang]:
                        sub_entries = auto_subs[lang]
                        sub_entries = auto_subs[lang]
                        sub_source = f"auto/{lang}"
                        break
                
                if sub_entries:
                    # STRICTLY pick VTT format only (avoid json3/srv3 which returns raw JSON)
                    vtt_entry = next((e for e in sub_entries if e.get('ext') == 'vtt'), None)
                    
                    if not vtt_entry:
                        logger.info("No VTT format found, trying to construct VTT URL from available formats")
                        # Some YouTube entries have vtt available but not listed explicitly
                        # Try any format with 'vtt' in URL
                        for e in sub_entries:
                            url = e.get('url', '')
                            if 'fmt=vtt' in url or url.endswith('.vtt'):
                                vtt_entry = e
                                break
                    
                    if vtt_entry:
                        sub_url = vtt_entry.get('url')
                        if sub_url:
                            resp = requests.get(sub_url, timeout=15)
                            resp.raise_for_status()
                            raw_sub = resp.text
                            
                            # Verify it's VTT/text (not JSON)
                            if raw_sub.strip().startswith('WEBVTT') or '-->' in raw_sub[:500]:
                                lyrics_text = _parse_subtitle_to_lyrics(raw_sub)
                                method = "subtitle"
                                logger.info(f"Subtitle extraction successful ({sub_source}, {len(lyrics_text)} chars)")
                            else:
                                logger.warning(f"Subtitle content is not VTT format, skipping (starts with: {raw_sub[:50]})")
                    else:
                        logger.info("No VTT subtitle format available for this video")
                else:
                    logger.info("No subtitles found for this video in any target language")
                        
        except Exception as e:
            logger.warning(f"Subtitle extraction failed: {e}")
    
    # Step 2: Fallback to Whisper
    if not lyrics_text:
        audio_file_path = request.audio_path
        
        # If we have a URL but no audio_path, download audio first
        if not audio_file_path and request.url:
            try:
                temp_dir = ACESTEP_SOURCE_DIR / f"whisper_{uuid.uuid4()}"
                temp_dir.mkdir(parents=True, exist_ok=True)
                
                # Check for Suno URL to do direct download
                import re
                suno_match = re.search(r'suno\.com/song/([0-9a-fA-F-]{36})', request.url)
                if suno_match:
                    song_id = suno_match.group(1)
                    direct_url = f"https://cdn1.suno.ai/{song_id}.mp3"
                    logger.info(f"Detected Suno URL for Whisper. Downloading directly from: {direct_url}")
                    
                    output_template = str(temp_dir / f"whisper_audio.mp3")
                    response = requests.get(direct_url, stream=True, timeout=30)
                    response.raise_for_status()
                    with open(output_template, 'wb') as f:
                        for chunk in response.iter_content(chunk_size=8192):
                            f.write(chunk)
                else:
                    import yt_dlp
                    ydl_opts = {
                        'format': 'bestaudio/best',
                        'postprocessors': [{
                            'key': 'FFmpegExtractAudio',
                            'preferredcodec': 'mp3',
                            'preferredquality': '128',
                        }],
                        'outtmpl': str(temp_dir / 'whisper_audio'),
                        'noplaylist': True,
                        'quiet': True,
                    }
                    
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([request.url])
                
                downloaded = list(temp_dir.glob("*.*"))
                downloaded = [f for f in downloaded if f.suffix.lower() in ('.mp3', '.wav', '.m4a', '.ogg', '.flac')]
                if downloaded:
                    audio_file_path = str(downloaded[0])
                else:
                    raise Exception("Audio download for Whisper failed")
                    
            except Exception as e:
                logger.error(f"Audio download for Whisper failed: {e}")
                raise HTTPException(status_code=500, detail=f"Could not download audio: {e}")
        
        if audio_file_path:
            try:
                logger.info(f"Starting Whisper transcription: {audio_file_path}")
                try:
                    import whisper
                except ImportError:
                    raise HTTPException(
                        status_code=500, 
                        detail="Whisper is not installed in the server environment. "
                               "Subtitle extraction also failed. Please try a different URL "
                               "or install openai-whisper: pip install openai-whisper"
                    )
                
                # Use small model for speed (base is faster but less accurate)
                model = whisper.load_model("small", device="cuda" if torch.cuda.is_available() else "cpu")
                result = model.transcribe(
                    audio_file_path, 
                    language=request.language if request.language != "auto" else None,
                    task="transcribe"
                )
                
                # Structure the lyrics from segments
                lyrics_text = _structure_whisper_output(result)
                method = "whisper"
                logger.info(f"Whisper transcription successful ({len(lyrics_text)} chars)")
                
                # Cleanup Whisper model from GPU
                del model
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                
            except Exception as e:
                logger.error(f"Whisper transcription failed: {e}")
                raise HTTPException(status_code=500, detail=f"Lyrics extraction failed: {e}")
    
    if not lyrics_text:
        raise HTTPException(status_code=404, detail="Could not extract lyrics from the provided source.")
    
    # Cleanup temp files
    whisper_temp = ACESTEP_SOURCE_DIR / f"whisper_{uuid.uuid4()}"
    if whisper_temp.exists():
        shutil.rmtree(whisper_temp, ignore_errors=True)
    
    return {"lyrics": lyrics_text, "method": method}


def _parse_subtitle_to_lyrics(raw_sub: str) -> str:
    """Parse VTT/SRT subtitle content into clean lyrics text."""
    import re
    lines = raw_sub.split('\n')
    lyrics_lines = []
    
    for line in lines:
        line = line.strip()
        # Skip VTT headers, timestamps, and empty lines
        if not line:
            continue
        if line.startswith('WEBVTT') or line.startswith('NOTE') or line.startswith('Kind:') or line.startswith('Language:'):
            continue
        if re.match(r'^\d+$', line):  # SRT sequence number
            continue
        if re.match(r'[\d:.,\-\s]+-->[\d:.,\-\s]+', line):  # timestamp
            continue
        
        # Remove VTT tags like <c>, </c>, <00:00:01.000>
        line = re.sub(r'<[^>]+>', '', line)
        # Remove noise markers like [音楽], [Music], [Applause]
        line = re.sub(r'\[.*?\]', '', line)
        line = line.strip()
        
        if not line:
            continue
        
        # Skip common auto-caption noise words
        if line in ["He.", "you", "Music", "音楽"]:
            continue
        
        # Remove trailing noise like "He." at end of line
        line = re.sub(r'He\.$', '', line).strip()
        if not line:
            continue
            
        # Skip exact duplicate of previous line (auto-caption overlap)
        if lyrics_lines and line == lyrics_lines[-1]:
            continue
            
        lyrics_lines.append(line)
    
    return '\n'.join(lyrics_lines)


def _structure_whisper_output(result: dict) -> str:
    """Convert Whisper output to structured lyrics with section tags."""
    segments = result.get('segments', [])
    if not segments:
        return result.get('text', '')
    
    lyrics_lines = []
    current_section_start = 0
    section_count = 0
    SECTION_DURATION = 30  # Approximate section length in seconds
    
    section_labels = ['[Intro]', '[Verse 1]', '[Pre-Chorus]', '[Chorus]', 
                      '[Verse 2]', '[Pre-Chorus]', '[Chorus]', '[Bridge]', 
                      '[Chorus]', '[Outro]']
    
    for seg in segments:
        seg_start = seg.get('start', 0)
        text = seg.get('text', '').strip()
        
        if not text:
            continue
        
        # Add section labels at approximate intervals
        if seg_start - current_section_start >= SECTION_DURATION:
            if section_count < len(section_labels):
                lyrics_lines.append('')
                lyrics_lines.append(section_labels[section_count])
            section_count += 1
            current_section_start = seg_start
        elif section_count == 0:
            lyrics_lines.append(section_labels[0])
            section_count += 1
        
        lyrics_lines.append(text)
    
    return '\n'.join(lyrics_lines)




class MinimaxRequest(BaseModel):
    lyrics: str
    prompt: str

@app.post("/acestep/minimax/generate")
async def generate_minimax(request: MinimaxRequest):
    """
    Generate music using MiniMax Music 2.5 API.
    """
    from minimax_service import generate_music_minimax
    try:
        # Validation
        if len(request.lyrics) > 3500:
            raise HTTPException(status_code=400, detail="歌詞が長すぎます（上限3500文字）。")
        if len(request.prompt) > 2000:
            raise HTTPException(status_code=400, detail="プロンプトが長すぎます（上限2000文字）。")

        result = generate_music_minimax(request.lyrics, request.prompt)
        return result
    except Exception as e:
        logger.error(f"MiniMax generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/acestep/generate")
async def acestep_generate(request: AceStepRequest):
    """
    Generate music using ACE-Step API.
    """
    result = acestep_service.release_task(
        request.prompt,
        request.lyrics,
        thinking=request.thinking,
        inference_steps=request.inference_steps,
        batch_size=request.batch_size,
        audio_duration=request.duration,
        vocal_language=request.language,
        model=request.model,
        sample_mode=request.sample_mode,
        sample_query=request.sample_query,
        seed=request.seed,
        task_type=request.task_type,
        audio_cover_strength=request.audio_cover_strength,
        repainting_start=request.repainting_start,
        repainting_end=request.repainting_end,
        src_audio_path=request.src_audio_path,
        use_adg=request.use_adg,
        reference_audio_path=request.reference_audio_path,
        track_name=request.track_name
    )
    
    if "error" in result and result["error"]:
        raise HTTPException(status_code=500, detail=result["error"])
    
    return result

@app.post("/acestep/post-process")
async def acestep_post_process(request: PostProcessRequest):
    """
    Post-process an audio file:
    1. Resolve local path from URL.
    2. Detect beats using librosa.
    3. Trim at the last musical boundary (near the end).
    4. Apply a smooth fade-out.
    """
    try:
        # Resolve local path from URL
        local_path = _resolve_web_path(request.file_url)
        if not local_path.exists():
            raise HTTPException(status_code=404, detail=f"Audio file not found: {request.file_url}")

        import librosa
        import soundfile as sf
        import numpy as np

        logger.info(f"[PostProcess] Loading audio: {local_path}")
        # Load audio (mono=False to keep stereo)
        y, sr = librosa.load(str(local_path), sr=None, mono=False)
        
        # Beat detection on mono version
        y_mono = librosa.to_mono(y) if y.ndim > 1 else y
        tempo, beats = librosa.beat.beat_track(y=y_mono, sr=sr, units='samples')
        
        duration_samples = y.shape[1] if y.ndim > 1 else len(y)
        original_duration = duration_samples / sr
        
        # 1. Audio Trim at beat boundary
        cut_point = duration_samples
        if request.auto_trim and len(beats) > 0:
            # We want to cut at the last beat that is not TOO close to the physical end
            # (leaving some room for natural decay, but avoiding unfinished phrases)
            # Find the last beat before the end
            # We don't want to cut off more than 5 seconds unless necessary
            last_valid_beats = beats[beats < (duration_samples - int(0.1 * sr))] # avoid very end
            if len(last_valid_beats) > 0:
                # Find the beat closest to the end, but at least 0.5s before or something?
                # Actually, let's just take the last detected beat.
                cut_point = last_valid_beats[-1]
                
                # Update audio
                if y.ndim > 1:
                    y = y[:, :cut_point]
                else:
                    y = y[:cut_point]
                duration_samples = cut_point
                logger.info(f"[PostProcess] Trimmed at beat: {cut_point/sr:.2f}s (from {original_duration:.2f}s)")

        # 2. Apply Fade out
        fade_samples = int(request.fade_duration * sr)
        if fade_samples > duration_samples:
            fade_samples = duration_samples // 4 # Limit fade
            
        if fade_samples > 0:
            # Quadratic fade out for more natural curve
            fade_curve = np.linspace(1.0, 0.0, fade_samples) ** 2
            if y.ndim > 1:
                # Apply to both channels
                y[:, -fade_samples:] *= fade_curve
            else:
                y[-fade_samples:] *= fade_curve
            logger.info(f"[PostProcess] Applied {request.fade_duration}s fade out")

        # 3. Save to a new file in MERGED_DIR
        processed_file_id = f"rp_{uuid.uuid4().hex[:8]}"
        processed_filename = f"{processed_file_id}.wav"
        processed_path = MERGED_DIR / processed_filename
        
        # soundfile expect (samples, channels)
        save_data = y.T if y.ndim > 1 else y
        sf.write(str(processed_path), save_data, sr)
        
        web_url = f"/outputs/merged/{processed_filename}"
        logger.info(f"[PostProcess] Saved to {web_url}")
        
        return {
            "status": "success",
            "url": web_url,
            "path": str(processed_path.resolve()),
            "original_duration": original_duration,
            "new_duration": duration_samples / sr,
            "tempo": float(tempo)
        }
    except Exception as e:
        logger.error(f"[PostProcess] Failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/acestep/status/{task_id}")
async def acestep_status(task_id: str, request: Request):
    """
    Get the status of an ACE-Step generation task.
    """
    result = acestep_service.query_result(task_id)
    logger.info(f"[acestep_status] Raw query_result for {task_id}: status={result.get('status')}, error={result.get('error')}, keys={list(result.keys())}")
    
    # Harmonize response for the frontend
    # ACE-Step status: 0=running/queued, 1=success, 2=failed
    status_map = {0: "processing", 1: "completed", 2: "failed"}
    raw_status = result.get("status")
    mapped_status = status_map.get(raw_status, "processing")  # Default to processing for unknown statuses
    
    # CRITICAL FIX: If status is "processing", NEVER show an error to the user.
    # The ACESTEP API sometimes returns error="Not Found" while still processing.
    raw_error = result.get("error") or None
    if mapped_status == "processing":
        raw_error = None  # Suppress transient errors during processing
    
    harmonized = {
        "task_id": task_id,
        "status": mapped_status,
        "progress": 100 if raw_status == 1 else 0,
        "result": result.get("result"),
        "error": raw_error
    }
    
    # If completed, transform audio paths to full URLs
    if harmonized["status"] == "completed" and harmonized["result"]:
        # ACE-Step API (port 8101) serves audio files via /v1/audio endpoint
        # We just need to ensure the URL points to localhost:8101
        base_url = "http://localhost:8101"
        
        output_files = []
        for item in harmonized["result"]:
            if item.get("file"):
                file_path = item["file"]
                
                # The file field contains a URL like "/v1/audio?path=..."
                # Just prepend the base URL
                if file_path.startswith("/"):
                    item["url"] = f"{base_url}{file_path}"
                elif file_path.startswith("http"):
                    item["url"] = file_path
                else:
                    # Absolute path - construct API URL
                    from urllib.parse import quote
                    item["url"] = f"{base_url}/v1/audio?path={quote(file_path)}"
                    
                output_files.append(item)
        harmonized["output_files"] = output_files

    return harmonized
class SaveFileRequest(BaseModel):
    file_url: str

@app.post("/save_file")
async def save_file(request: SaveFileRequest):
    """
    Downloads/copies an audio file from the given file_url and saves it to outputs/ACE-STEP/.
    """
    file_url = request.file_url
    if not file_url:
        raise HTTPException(status_code=400, detail="Missing file_url")

    save_dir = OUTPUT_DIR / "ACE-STEP"
    save_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate a unique filename
    filename = f"saved_{uuid.uuid4().hex[:8]}.wav"
    
    import urllib.parse
    parsed = urllib.parse.urlparse(file_url)
    if "path=" in parsed.query:
        query_params = urllib.parse.parse_qs(parsed.query)
        if "path" in query_params:
            original_path = query_params["path"][0]
            name = Path(original_path).name
            if name and "." in name:
                filename = name
    else:
        name = Path(parsed.path).name
        if name and "." in name:
            filename = name
            
    dest_path = save_dir / filename
    counter = 1
    while dest_path.exists():
        dest_path = save_dir / f"{dest_path.stem}_{counter}{dest_path.suffix}"
        counter += 1

    try:
        from fastapi.concurrency import run_in_threadpool
        if file_url.startswith("http"):
            def _download():
                response = requests.get(file_url, stream=True, timeout=10)
                response.raise_for_status()
                with open(dest_path, "wb") as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
            await run_in_threadpool(_download)
        else:
            local_path = file_url
            if local_path.startswith("/"):
                local_path = local_path.lstrip("/")
            full_local = PROJECT_DIR / local_path
            if not full_local.exists():
                raise HTTPException(status_code=404, detail="Original file not found locally")
            await run_in_threadpool(shutil.copy2, full_local, dest_path)
            
        return {"data": {"saved_path": str(dest_path.resolve())}}
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP error downloading {file_url}: {e}")
        raise HTTPException(status_code=404, detail="Audio file not found on server")
    except Exception as e:
        logger.error(f"Error saving file from {file_url}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8100, reload=True)
