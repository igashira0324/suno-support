"""
Audio utility routes — /trim, /save_file, /svs/*.
"""

import os
import re
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Form, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from pydub import AudioSegment
import io

from core.config import (
    tasks, logger,
    SERVER_DIR, PROJECT_DIR, UPLOAD_DIR, OUTPUT_DIR, MERGED_DIR,
)
from core.paths import resolve_web_path

router = APIRouter()


# ---------------------------------------------------------------------------
# /trim
# ---------------------------------------------------------------------------

@router.post("/trim")
async def trim_audio(
    file_path: str = Form(...),
    start_time: float = Form(...),
    end_time: float = Form(...),
):
    from fastapi.responses import StreamingResponse
    try:
        # Prevent accessing files outside of allowed directories
        allowed_dirs = [str(UPLOAD_DIR), str(OUTPUT_DIR)]
        
        normalized_path = file_path.replace("/", os.sep)
        if normalized_path.startswith(os.sep):
             normalized_path = normalized_path[1:]
              
        potential_path = PROJECT_DIR / normalized_path
        
        if not potential_path.exists():
             potential_path = SERVER_DIR / normalized_path
        
        target_path = potential_path.resolve()
        
        # Security check: Ensure path is within allowed directories
        is_safe = False
        for allowed in allowed_dirs:
            if str(target_path).startswith(str(Path(allowed).resolve())):
                is_safe = True
                break
        
        if str(target_path).startswith(str(PROJECT_DIR.resolve())):
             is_safe = True
        
        if not is_safe:
             logger.warning(f"Access denied (path traversal): {target_path}")
             raise HTTPException(status_code=403, detail="Access denied: path outside project directory")

        if not target_path.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

        # Load audio
        audio = AudioSegment.from_file(str(target_path))
        duration_sec = len(audio) / 1000.0
        
        # Validation
        if start_time < 0:
            raise HTTPException(status_code=400, detail="start_time must be >= 0")
        if end_time <= start_time:
            raise HTTPException(status_code=400, detail="end_time must be greater than start_time")
        if start_time >= duration_sec:
            raise HTTPException(status_code=400, detail="start_time exceeds audio duration")
        
        # Clamp end_time to duration
        end_time = min(end_time, duration_sec)
        
        start_ms = int(start_time * 1000)
        end_ms = int(end_time * 1000)
        trimmed = audio[start_ms:end_ms]
        
        # Export to in-memory buffer as MP3
        output = io.BytesIO()
        trimmed.export(output, format="mp3", bitrate="320k")
        output.seek(0)
        filename = f"trimmed_{target_path.stem}.mp3"
        
        return StreamingResponse(
            output,
            media_type="audio/mpeg",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Trim error: {e}")
        raise HTTPException(status_code=500, detail=str(e))



# ---------------------------------------------------------------------------
# /save_file
# ---------------------------------------------------------------------------

class SaveFileRequest(BaseModel):
    file_url: str
    theme: Optional[str] = None
    title: Optional[str] = None

@router.post("/save_file")
async def save_file(request: SaveFileRequest):
    """Downloads/copies an audio file from the given file_url and saves it to outputs/ACE-STEP/."""
    import urllib.parse
    import requests

    file_url = request.file_url
    if not file_url:
        raise HTTPException(status_code=400, detail="Missing file_url")

    save_dir = OUTPUT_DIR / "ACE-STEP"
    save_dir.mkdir(parents=True, exist_ok=True)
    
    parsed = urllib.parse.urlparse(file_url)
    original_name = ""
    if "path=" in parsed.query:
        query_params = urllib.parse.parse_qs(parsed.query)
        if "path" in query_params:
            original_name = Path(query_params["path"][0]).name
    else:
        original_name = Path(parsed.path).name

    ext = ".mp3"
    url_stem = ""
    if original_name and "." in original_name:
        p = Path(original_name)
        ext = p.suffix
        url_stem = p.stem
    
    def sanitize(name: str):
        if not name: return None
        s = re.sub(r'[\\/:*?"<>|]', '_', name).strip(" .")
        return s[:200] if s else None

    base_name = sanitize(request.theme)
    if not base_name:
        base_name = sanitize(request.title)
    if not base_name:
        base_name = sanitize(url_stem)
    if not base_name:
        base_name = f"saved_{uuid.uuid4().hex[:8]}"
            
    dest_path = save_dir / f"{base_name}{ext}"
    counter = 1
    while dest_path.exists():
        dest_path = save_dir / f"{base_name}_{counter}{ext}"
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
    except Exception as e:
        logger.error(f"Error saving file from {file_url}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")


