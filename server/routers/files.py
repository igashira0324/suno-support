import shutil
import uuid
import io
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from pydub import AudioSegment

from core.config import settings
from core.utils import resolve_web_path, download_audio_from_url

router = APIRouter(prefix="/files", tags=["files"])

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        ext = Path(file.filename).suffix or ".mp3"
        file_id = str(uuid.uuid4())
        filename = f"{file_id}{ext}"
        filepath = settings.upload_dir / filename
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"status": "success", "path": str(filepath.resolve()), "filename": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/download-url")
async def download_from_url(url: str = Form(...)):
    if not url: raise HTTPException(status_code=400, detail="URL is required")
    try:
        final_path = await download_audio_from_url(url, settings.upload_dir)
        return {"status": "success", "path": str(final_path.resolve())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/trim")
async def trim_audio(
    file_path: str = Form(...),
    start_time: float = Form(...),
    end_time: float = Form(...),
):
    try:
        target_path = resolve_web_path(file_path)
        
        if not target_path.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

        audio = AudioSegment.from_file(str(target_path))
        start_ms = int(start_time * 1000)
        end_ms = int(end_time * 1000)
        trimmed = audio[start_ms:end_ms]
        
        output = io.BytesIO()
        trimmed.export(output, format="mp3", bitrate="192k")
        output.seek(0)
        filename = f"trimmed_{target_path.stem}.mp3"
        
        return StreamingResponse(
            output, 
            media_type="audio/mpeg", 
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
