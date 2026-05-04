import os
import logging
from fastapi import APIRouter, HTTPException, Body, UploadFile, File, Form
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

import gemini_service

logger = logging.getLogger("SunoArchitect.GeminiRouter")

router = APIRouter(prefix="/gemini", tags=["gemini"])

class PromptRequest(BaseModel):
    text: str = ""
    youtube_url: str = ""
    mode: str = "auto"
    options: Dict[str, Any] = {}
    theme: str = ""
    image_path: Optional[str] = None

@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):
    try:
        from core.config import settings
        import shutil
        import uuid
        from pathlib import Path
        
        ext = Path(file.filename).suffix or ".jpg"
        file_id = str(uuid.uuid4())
        filepath = settings.upload_dir / f"img_{file_id}{ext}"
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"status": "success", "path": str(filepath.resolve())}
    except Exception as e:
        logger.error(f"Image upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-suno-prompt")
async def generate_suno_prompt(request: PromptRequest):
    try:
        result = await gemini_service.generate_suno_prompt(
            text=request.text,
            youtube_url=request.youtube_url,
            image_path=request.image_path,
            mode=request.mode,
            options=request.options,
            theme=request.theme
        )
        if isinstance(result, dict) and result.get("error"):
            # If the service returned an error dictionary, raise it as a real exception
            raise HTTPException(status_code=500, detail=result.get("error"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Gemini generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class StructureRequest(BaseModel):
    lyrics: str
    language: str = "ja"
    model_name: str = "gemini-2.5-flash"

@router.post("/structure-lyrics")
async def structure_lyrics(request: StructureRequest):
    try:
        result = await gemini_service.structure_lyrics(
            raw_lyrics=request.lyrics,
            language=request.language,
            model_name=request.model_name
        )
        return {"lyrics": result}
    except Exception as e:
        logger.error(f"Lyrics structuring failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/analyze-url")
async def analyze_url(url: str = Body(..., embed=True)):
    metadata = gemini_service.fetch_url_metadata(url)
    if not metadata:
        raise HTTPException(status_code=404, detail="Could not fetch metadata")
    return metadata

class Phase2Request(BaseModel):
    selected_title: str
    original_analysis: str
    style_candidates: List[str]
    options: Dict[str, Any] = {}

@router.post("/generate-from-selected-title")
async def generate_from_selected_title(request: Phase2Request):
    try:
        result = await gemini_service.generate_from_selected_title(
            selected_title=request.selected_title,
            original_analysis=request.original_analysis,
            style_candidates=request.style_candidates,
            options=request.options
        )
        if isinstance(result, dict) and result.get("error"):
            raise HTTPException(status_code=500, detail=result.get("error"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Phase 2 generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class TitleRequest(BaseModel):
    lyrics: str
    theme: str = ""
    prompt: str = ""
    model_name: str = "gemini-2.5-flash"

@router.post("/generate-title")
async def generate_title(request: TitleRequest):
    try:
        result = await gemini_service.generate_title(
            lyrics=request.lyrics,
            theme=request.theme,
            prompt=request.prompt,
            model_name=request.model_name
        )
        return {"title": result}
    except Exception as e:
        logger.error(f"Title generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class StyleRequest(BaseModel):
    lyrics: str
    url: str = ""
    theme: str = ""
    language: str = "ja"
    model_name: str = "gemini-2.5-flash"

@router.post("/generate-style-from-lyrics")
async def generate_style_from_lyrics(request: StyleRequest):
    try:
        result = await gemini_service.generate_style_from_lyrics(
            lyrics=request.lyrics,
            url=request.url,
            theme=request.theme,
            language=request.language,
            model_name=request.model_name
        )
        return {"style": result}
    except Exception as e:
        logger.error(f"Style generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
