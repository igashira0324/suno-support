"""
YuE generation routes — /yue/generate, /yue/status/{job_id}.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

import yue_service

router = APIRouter(prefix="/yue")


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class YuEGenerationRequest(BaseModel):
    genre_txt: str
    lyrics_txt: str
    quality: str = "fast"
    language: str = "en"
    title: str = "My Song"
    segments: int = 2
    max_new_tokens: int = 3000
    vocal_type: str = "female"
    stage2_model: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/generate")
async def start_yue_generation(request: YuEGenerationRequest):
    """Start a YuE music generation job."""
    options = {
        "quality": request.quality,
        "language": request.language,
        "title": request.title,
        "segments": request.segments,
        "max_new_tokens": request.max_new_tokens,
        "vocal_type": request.vocal_type,
    }
    if request.stage2_model:
        options["stage2_model"] = request.stage2_model

    job_id = yue_service.start_generation_job(
        request.genre_txt,
        request.lyrics_txt,
        options
    )
    return {"job_id": job_id}


@router.get("/status/{job_id}")
async def get_yue_status(job_id: str):
    """Get YuE job status."""
    status = yue_service.get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    return status
