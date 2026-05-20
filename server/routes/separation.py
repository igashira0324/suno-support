"""
Audio separation routes — /separate, /separate-url, /separate-generated.
"""

import shutil
import threading
import uuid
import asyncio
from pathlib import Path
from core.paths import resolve_web_path
from core.audio_utils import transcode_to_mp3
from urllib.parse import unquote

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from pydantic import BaseModel

from core.config import (
    tasks, logger,
    PROJECT_DIR, UPLOAD_DIR, SEPARATION_DIR, MERGED_DIR,
)
from core.download import download_audio_from_url

router = APIRouter()


# ---------------------------------------------------------------------------
# Background worker
# ---------------------------------------------------------------------------

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
        # Note: v0.10.1 (standard on this system) takes model_name in __init__
        # and does not have load_model().
        model_name = "UVR_MDXNET_KARA_2"  # Standard high-quality vocal model for v0.10.1
        
        logger.info(f"[{task_id}] Initializing Separator with model: {model_name}...")
        
        separator = Separator(
            audio_file_path=str(file_path),
            output_dir=str(output_dir),
            model_name=model_name,
            output_format="WAV"
        )
        
        tasks[task_id]["progress"] = 25
        logger.info(f"[{task_id}] Separator initialized. Starting separation...")
        
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
            logger.info(f"[{task_id}] Running Demucs htdemucs_ft separation...")
            output_files = separator.separate()
            
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
                        instrumental_candidate = output_dir / f"merged_instrumental_{task_id}.mp3"
                        combined.export(str(instrumental_candidate), format="mp3", bitrate="320k")
                        logger.info(f"[{task_id}] Created instrumental from non-vocal stems.")
                except Exception as e:
                    logger.warning(f"[{task_id}] Failed to merge stems: {e}")
            
            if not vocals_candidate:
                 logger.warning(f"[{task_id}] Vocals not found in output. Using original as fallback.")
                 vocals_candidate = file_path
            
            # Export to final expected names (Properly encode to MP3 via utility)
            if vocals_candidate and vocals_candidate.exists():
                target = output_dir / "vocals.mp3"
                transcode_to_mp3(vocals_candidate, target, bitrate="320k")
                
                # Cleanup candidate if it was a temporary WAV
                if vocals_candidate.suffix.lower() != ".mp3":
                    vocals_candidate.unlink()
                logger.info(f"[{task_id}] Final vocals (320k MP3): {target}")
            
            if instrumental_candidate and instrumental_candidate.exists():
                target = output_dir / "instrumental.mp3"
                transcode_to_mp3(instrumental_candidate, target, bitrate="320k")
                
                # Cleanup candidate if it was a temporary WAV
                if instrumental_candidate.suffix.lower() != ".mp3":
                    instrumental_candidate.unlink()
                logger.info(f"[{task_id}] Final instrumental (320k MP3): {target}")

        except Exception as e:
              raise e
        finally:
            stop_progress.set()
            progress_thread.join()
        
        # Check for cancellation
        if tasks[task_id].get("status") == "cancelled":
             logger.info(f"[{task_id}] Task cancelled by user.")
             return

        final_vocals_path = output_dir / "vocals.mp3"
        final_instrumental_path = output_dir / "instrumental.mp3"

        if not final_vocals_path.exists() or not final_instrumental_path.exists():
             logger.warning(f"[{task_id}] Separation files missing! Vocals: {final_vocals_path.exists()}, Inst: {final_instrumental_path.exists()}")
             for f in output_dir.iterdir():
                 if f.suffix == ".wav" and "Vocals" in f.name and not final_vocals_path.exists():
                     transcode_to_mp3(f, final_vocals_path, bitrate="320k")
                     f.unlink()
                 if f.suffix == ".wav" and "Instrumental" in f.name and not final_instrumental_path.exists():
                     transcode_to_mp3(f, final_instrumental_path, bitrate="320k")
                     f.unlink()

        # Build web-path for original audio
        original_web_path = ""
        full_original_path = tasks[task_id].get("original_path", "")
        if full_original_path:
            path_obj = Path(full_original_path)
            if str(UPLOAD_DIR) in str(path_obj.parent):
                original_web_path = f"/uploads/{path_obj.name}"
            else:
                original_web_path = full_original_path

        tasks[task_id]["result"] = {
            "vocals_url": f"/outputs/separated/{task_id}/vocals.mp3",
            "instrumental_url": f"/outputs/separated/{task_id}/instrumental.mp3",
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


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/separate")
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

        thread = threading.Thread(target=run_separation_task, args=(task_id, input_path), daemon=True)
        thread.start()
        
        return {"status": "success", "task_id": task_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class SeparateURLRequest(BaseModel):
    url: str

@router.post("/separate-url")
async def separate_audio_url(request: SeparateURLRequest):
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
                final_path = await download_audio_from_url(request.url, UPLOAD_DIR)
                tasks[task_id]["progress"] = 20
                
                tasks[task_id]["original_path"] = f"/uploads/{final_path.name}"
                tasks[task_id]["filename"] = final_path.name
                
                thread = threading.Thread(target=run_separation_task, args=(task_id, final_path), daemon=True)
                thread.start()
                
            except ValueError as ve:
                logger.warning(f"[{task_id}] SSRF validation failed: {ve}")
                tasks[task_id]["status"] = "failed"
                tasks[task_id]["error"] = f"URL not allowed: {ve}"
            except Exception as e:
                logger.error(f"[{task_id}] Download/Separation failed: {e}")
                tasks[task_id]["status"] = "failed"
                tasks[task_id]["error"] = str(e)

        asyncio.create_task(download_and_separate_task())
        
        return {"status": "success", "task_id": task_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class SeparateGeneratedRequest(BaseModel):
    file_url: str

@router.post("/separate-generated")
async def separate_generated_audio(request: SeparateGeneratedRequest):
    """
    Separate a generated audio file (e.g. from ACE-Step) into vocals + instrumental.
    """
    try:
        try:
            file_path = resolve_web_path(request.file_url)
        except ValueError as ve:
            raise HTTPException(status_code=403, detail=str(ve))
            
        logger.info(f"[SeparateGenerated] Resolved file_path: {file_path} (Exists: {file_path.exists()})")
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
        
        task_id = str(uuid.uuid4())
        tasks[task_id] = {
            "status": "processing",
            "progress": 0,
            "filename": file_path.name,
            "original_path": str(file_path)
        }
        
        thread = threading.Thread(target=run_separation_task, args=(task_id, file_path), daemon=True)
        thread.start()
        
        return {"status": "success", "task_id": task_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
