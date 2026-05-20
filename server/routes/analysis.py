"""
Analysis, CLAP, and Suno metadata routes.
"""

import re
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel

from core.config import logger, UPLOAD_DIR, OUTPUT_DIR
from core.paths import resolve_fs_path

router = APIRouter()


# ---------------------------------------------------------------------------
# /analyze
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    file_path: str

@router.post("/analyze")
async def analyze_audio(request: AnalyzeRequest):
    """Analyze audio file for intensity curve, BPM, key, and peak segments."""
    try:
        import audio_analysis

        fs_path = resolve_fs_path(request.file_path)
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


# ---------------------------------------------------------------------------
# CLAP
# ---------------------------------------------------------------------------

class CLAPSearchRequest(BaseModel):
    file_path: str
    query: str
    window_sec: float = 5.0
    top_k: int = 5

@router.post("/clap/search")
async def clap_search(request: CLAPSearchRequest):
    """Search for audio segments matching a natural language query using CLAP."""
    try:
        import clap_service

        fs_path = resolve_fs_path(request.file_path)
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

@router.get("/clap/presets")
async def get_clap_presets():
    """Get preset query options for CLAP search UI."""
    import clap_service
    service = clap_service.get_clap_service()
    return {"presets": service.get_preset_queries()}


# ---------------------------------------------------------------------------
# Suno URL metadata
# ---------------------------------------------------------------------------

@router.post("/suno/analyze")
async def analyze_suno(url: str = Body(..., embed=True)):
    try:
        if not url:
            raise HTTPException(status_code=400, detail="URL is required")
            
        logger.info(f"Analyzing Suno URL: {url}")
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

        # 1. Fetch page
        try:
            response = requests.get(url, headers=headers, timeout=15)
            final_url = response.url
            if not response.ok:
                raise HTTPException(status_code=400, detail="Failed to fetch URL")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to reach Suno: {str(e)}")

        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 2. Extract Song ID
        song_id = None
        match = re.search(r'song/([0-9a-fA-F-]{36})', final_url)
        if match:
            song_id = match.group(1)

        # 3. OG tags (primary source — reliable on current Suno layout)
        og_title = soup.find("meta", property="og:title")
        og_desc = soup.find("meta", property="og:description")
        og_image = soup.find("meta", property="og:image")
        og_video = soup.find("meta", property="og:video")

        # Twitter cards (fallback)
        tw_title = soup.find("meta", attrs={"name": "twitter:title"})
        tw_desc = soup.find("meta", attrs={"name": "twitter:description"})
        tw_image = soup.find("meta", attrs={"name": "twitter:image"})

        title_content = None
        desc_content = None
        thumbnail_content = None
        video_content = None
        audio_content = None

        if og_title and og_title.get("content") and og_title["content"] != "Suno":
            title_content = og_title["content"]
        elif tw_title and tw_title.get("content"):
            title_content = tw_title["content"]

        if og_desc and og_desc.get("content"):
            desc_content = og_desc["content"]
        elif tw_desc and tw_desc.get("content"):
            desc_content = tw_desc["content"]

        if og_image and og_image.get("content"):
            thumbnail_content = og_image["content"]
        elif tw_image and tw_image.get("content"):
            thumbnail_content = tw_image["content"]

        if og_video and og_video.get("content"):
            video_content = og_video["content"]

        # 4. CDN direct audio link (predictable pattern)
        if song_id:
            audio_content = f"https://cdn1.suno.ai/{song_id}.mp3"

        # 5. Filter out generic description
        if desc_content and desc_content.strip() in (
            "Listen and make your own on Suno.",
            "Listen to music made by Suno.",
        ):
            desc_content = ""

        if not title_content:
            title_content = "Unknown Title"
        
        result = {
            "title": title_content,
            "description": desc_content or "",
            "thumbnail": thumbnail_content,
            "provider": "Suno.ai",
        }
        if audio_content:
            result["audio_url"] = audio_content
        if video_content:
            result["video_url"] = video_content

        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Suno analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

