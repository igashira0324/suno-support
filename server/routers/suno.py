import requests
import re
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException, Body

router = APIRouter(prefix="/suno", tags=["suno"])

def analyze_suno_logic(url: str):
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # Metadata extraction
        title = soup.find("meta", property="og:title")
        description = soup.find("meta", property="og:description")
        image = soup.find("meta", property="og:image")
        
        # Suno specific song ID extraction
        song_id = None
        suno_match = re.search(r'suno\.com/song/([0-9a-fA-F-]{36})', url)
        if suno_match:
            song_id = suno_match.group(1)

        return {
            "title": title["content"] if title else "Unknown",
            "description": description["content"] if description else "",
            "image": image["content"] if image else None,
            "song_id": song_id,
            "provider": "Suno.ai"
        }
    except Exception as e:
        return {"error": str(e)}

@router.post("/analyze")
async def analyze_suno(url: str = Body(..., embed=True)):
    result = analyze_suno_logic(url)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.get("/info/{song_id}")
async def get_suno_info(song_id: str):
    # Try multiple API endpoints
    for api_url in [f"https://studio-api.prod.suno.com/api/feed/?ids={song_id}", f"https://studio-api.suno.ai/api/feed/?ids={song_id}"]:
        try:
            resp = requests.get(api_url, timeout=10)
            if resp.ok:
                data = resp.json()
                if data and isinstance(data, list):
                    return data[0]
        except: continue
    
    raise HTTPException(status_code=404, detail="Song info not found via API")
