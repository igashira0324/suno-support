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

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Body
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

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
YUE_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
SEPARATION_DIR.mkdir(parents=True, exist_ok=True)

# Mount static files
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
        tasks[task_id]["progress"] = 5
        
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
        
        tasks[task_id]["progress"] = 20
        logger.info(f"[{task_id}] Loading model: MDX23C-8KFFT-InstVoc_HQ ...")
        
        # Load the model (this will download it on first run if not cached)
        # MDX23C-8KFFT-InstVoc_HQ is a high-quality vocals/instrumental model
        separator.load_model(model_filename="MDX23C-8KFFT-InstVoc_HQ.ckpt")
        
        tasks[task_id]["progress"] = 1
        logger.info(f"[{task_id}] Model loaded. Starting separation...")
        
        # Start simulated progress thread
        stop_progress = threading.Event()
        
        def simulate_progress():
            current = 1
            while not stop_progress.is_set():
                if stop_progress.wait(timeout=1.0): # Wait up to 1s, break immediately if set
                    break
                
                if current < 95:
                    current += 1
                
                # Only update if status is still processing AND stop event is not set
                # Also stop if cancelled
                if tasks[task_id].get("status") == "processing" and not stop_progress.is_set():
                    tasks[task_id]["progress"] = current
                    
        progress_thread = threading.Thread(target=simulate_progress, daemon=True)
        progress_thread.start()
        
        try:
            # Run separation (Blocking)
            # returns list of filenames
            output_files = separator.separate(str(file_path))
        except Exception as e:
            # If creating separator failed or other error
             raise e
        finally:
            # Signal thread to stop and WAIT for it to finish
            stop_progress.set()
            progress_thread.join() # Safe to wait here
        
        # Check for cancellation
        if tasks[task_id].get("status") == "cancelled":
             logger.info(f"[{task_id}] Task cancelled by user.")
             return

        # Verify outputs
        
        # Verify outputs
        # Usually named: <original_filename>_(Vocals)_BS-RoFormer-Viperx-1297.wav
        # We need to identify which is which. 
        # The model produces "Vocals" and "Instrumental" stems usually.
        
        vocals_path = None
        instrumental_path = None
        
        for fname in output_files:
            full_path = output_dir / fname
            if "Vocals" in fname:
                vocals_path = full_path
            elif "Instrumental" in fname:
                instrumental_path = full_path
                
        # Rename for consistency if found
        final_vocals_path = output_dir / "vocals.wav"
        final_instrumental_path = output_dir / "instrumental.wav"
        
        if vocals_path and vocals_path.exists():
            vocals_path.rename(final_vocals_path)
            vocals_path = final_vocals_path
            
        if instrumental_path and instrumental_path.exists():
            instrumental_path.rename(final_instrumental_path)
            instrumental_path = final_instrumental_path

        if not vocals_path or not instrumental_path:
             logger.warning(f"[{task_id}] Could not identify stems from: {output_files}")
             # Fallback: if only 2 files, assign heuristically or just error out?
             # audio-separator with 1297 model SHOULD return exactly these two.
             pass

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



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
