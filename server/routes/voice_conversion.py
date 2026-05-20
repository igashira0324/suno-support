"""
Voice conversion routes — /voice-convert (Seed-VC pipeline).
"""

import shutil
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

import numpy as np
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks

from core.config import (
    tasks, logger,
    PROJECT_DIR, OUTPUT_DIR,
)
from core.paths import resolve_web_path
from core.audio_utils import transcode_to_mp3

router = APIRouter()


# ---------------------------------------------------------------------------
# Background worker
# ---------------------------------------------------------------------------

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
        start_time = time.time()
        tasks[task_id]["progress"] = 1
        tasks[task_id]["status"] = "processing"
        logger.info(f"[{task_id}] Starting Seed-VC voice conversion (Steps: {diffusion_steps}, F0Cond: {f0_condition}, Pitch: {pitch_shift})...")
        logger.info(f"[{task_id}] original_path={original_path}, exists={original_path.exists() if original_path else 'N/A'}")
        
        # 1. Run inference.py
        seed_vc_dir = PROJECT_DIR / "seed-vc"
        output_dir = OUTPUT_DIR / "voice_converted" / task_id
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
        
        tasks[task_id]["progress"] = 5
        
        # Simulated progress thread for VC inference (~6.5 min)
        stop_progress = threading.Event()
        def simulate_vc_progress():
            current = 5
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

        try:
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
            if file.suffix.lower() in [".wav", ".mp3"] and file.name.startswith("vc_"):
                converted_vocal_path = file
                break
                
        if not converted_vocal_path:
            raise Exception("Converted vocal file not found in output directory.")
            
        # 3. Pro Mixing Pipeline
        import librosa
        import soundfile as sf
        from pedalboard import Pedalboard, Compressor, HighpassFilter, Reverb
        import matchering as mg

        tasks[task_id]["progress"] = 86
        
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
            
            min_len = min(vox_processed.shape[1], inst_audio.shape[1], original_audio.shape[1])
            vox_p = vox_processed[:, :min_len]
            inst_p = inst_audio[:, :min_len]
            orig_p = original_audio[:, :min_len]

            mel_freqs = librosa.mel_frequencies(n_mels=128, fmax=sr//2)
            vocal_band = (mel_freqs >= 1000) & (mel_freqs <= 5000)
            weights = np.ones(128)
            weights[vocal_band] = 1.1
            
            best_score = float("inf")
            best_mixed = None
            
            options_room_wet = [(0.2, 0.05), (0.3, 0.10), (0.4, 0.15)]
            options_duck = [0.0, 0.05, 0.10, 0.15]
            
            for room, wet in options_room_wet:
                for duck_amount in options_duck:
                    rev = Reverb(room_size=room, wet_level=wet, dry_level=1.0-wet)
                    v_rev = rev(vox_p, sr)
                    
                    v_mono = np.mean(vox_p, axis=0)
                    env = np.abs(v_mono)
                    win = int(sr * 0.05)
                    env = np.convolve(env, np.ones(win)/win, mode='same')
                    env = env / (np.max(env) + 1e-10)
                    
                    duck_curve = 1.0 - (env * duck_amount)
                    inst_ducked = inst_p * duck_curve[np.newaxis, :]
                    
                    m = (v_rev * 0.95) + (inst_ducked * 1.0)
                    
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
            logger.info(f"[{task_id}] ⚠️ No original audio (path={original_path}). Using default ducking/reverb.")
            rev = Reverb(room_size=0.3, wet_level=0.1)
            v_rev = rev(vox_processed, sr)
            
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
        final_output_path_wav = output_dir / "merged_output.wav"
        final_output_path = output_dir / "merged_output.mp3"
        
        if original_path and original_path.exists():
            tasks[task_id]["progress"] = 90
            logger.info(f"[{task_id}] ✅ Mastering with Matchering (ref={original_path})...")
            try:
                mg.process(
                    target=str(pre_master_path),
                    reference=str(original_path),
                    results=[mg.pcm24(str(final_output_path_wav))]
                )
            except Exception as me:
                logger.warning(f"[{task_id}] Matchering failed, falling back to pre-master: {me}")
                shutil.copy(pre_master_path, final_output_path_wav)
        else:
            shutil.copy(pre_master_path, final_output_path_wav)
            
        # Step D: Vocal Presence Enhancement (Post-Mastering EQ)
        tasks[task_id]["progress"] = 97
        logger.info(f"[{task_id}] ✅ Applying Vocal Presence Enhancement (Approach A)...")
        try:
            import librosa
            import soundfile as sf
            from pedalboard import Pedalboard, PeakFilter
            final_audio, _ = librosa.load(str(final_output_path), sr=sr, mono=False)
            final_audio = to_2d(final_audio)
            
            vocal_presence = Pedalboard([
                PeakFilter(cutoff_frequency_hz=2500, gain_db=0.7, q=0.8),
                PeakFilter(cutoff_frequency_hz=4500, gain_db=0.3, q=0.7),
            ])
            
            enhanced_audio = vocal_presence(final_audio, sr)
            
            max_val = np.max(np.abs(enhanced_audio))
            if max_val > 1.0:
                enhanced_audio = enhanced_audio / max_val * 0.98
                
            sf.write(str(final_output_path_wav), enhanced_audio.T, sr)
            logger.info(f"[{task_id}] Vocal presence enhanced successfully.")
        except Exception as ee:
            logger.warning(f"[{task_id}] Vocal presence enhancement failed: {ee}")
        
        # Final Step: Convert WAV to MP3 using central utility
        try:
            logger.info(f"[{task_id}] Encoding final result to MP3 (320k)...")
            transcode_to_mp3(final_output_path_wav, final_output_path, bitrate="320k")
            if final_output_path_wav.exists():
                final_output_path_wav.unlink()
            logger.info(f"[{task_id}] Final MP3 created: {final_output_path}")
        except Exception as encode_err:
            logger.error(f"[{task_id}] MP3 Encoding failed: {encode_err}")
            # Fallback: if MP3 fails, use WAV
            final_output_path = final_output_path_wav
        
        end_time = time.time()
        processing_time = round(end_time - start_time, 2)

        tasks[task_id]["progress"] = 100
        tasks[task_id]["status"] = "completed"
        tasks[task_id]["result"] = {
            "merged_url": f"/outputs/voice_converted/{task_id}/{final_output_path.name}",
            "processing_time": processing_time
        }
        logger.info(f"[{task_id}] Voice conversion and merge complete in {processing_time}s: {final_output_path}")
        
    except Exception as e:
        logger.error(f"[{task_id}] Voice Conversion Task Failed: {e}")
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"] = str(e)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/voice-convert")
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
        
        inst_path = resolve_web_path(instrumental_url)
        vox_path = resolve_web_path(vocals_url)
        orig_path = resolve_web_path(original_url) if original_url else None
        
        if not inst_path.exists() or not vox_path.exists():
            logger.warning(f"Paths not found as resolved: inst={inst_path}, vox={vox_path}")
            raise HTTPException(status_code=404, detail="Original instrumental or vocals not found.")
            
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
