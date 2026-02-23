import os
import requests
import uuid
import time
from pathlib import Path
from dotenv import load_dotenv
import logging

# Load environment variables from project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent
for env_file in [".env.local", ".env"]:
    env_path = PROJECT_ROOT / env_file
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)

logger = logging.getLogger("SunoArchitect.MiniMax")

OUTPUT_BASE_DIR = PROJECT_ROOT / "outputs" / "minimax"
OUTPUT_BASE_DIR.mkdir(parents=True, exist_ok=True)

def generate_music_minimax(lyrics: str, prompt: str):
    """
    Calls MiniMax Music 2.5 API to generate music and downloads the result.
    """
    api_key = os.getenv("MINIMAX_API_KEY")
    if not api_key:
        raise ValueError("MINIMAX_API_KEY is not set in environment variables. .env.local を確認してください。")

    url = "https://api.minimax.io/v1/music_generation"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "music-2.5",
        "prompt": prompt,
        "lyrics": lyrics,
        "audio_setting": {
            "sample_rate": 44100,
            "bitrate": 256000,
            "format": "mp3"
        },
        "output_format": "url"
    }

    logger.info(f"Calling MiniMax API (Lyrics: {len(lyrics)} chars, Prompt: {len(prompt)} chars)")
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=600)
        response.raise_for_status()
        data = response.json()
        
        # MiniMax API error handling based on typical response structure
        # (Assuming 'base_resp' or similar for error codes if not 200)
        if data.get("base_resp", {}).get("status_code") != 0:
            error_msg = data.get("base_resp", {}).get("status_msg", "Unknown error")
            if "credit" in error_msg.lower() or "balance" in error_msg.lower():
                raise Exception("MiniMaxのクレジットが不足しています。アカウントの残高を確認してください。")
            raise Exception(f"MiniMax API Error: {error_msg}")

        audio_url = data.get("data", {}).get("audio")
        if not audio_url:
            raise Exception("MiniMax API did not return an audio URL.")

        # Download the file
        logger.info(f"Downloading generated music from: {audio_url}")
        audio_response = requests.get(audio_url, timeout=60)
        audio_response.raise_for_status()

        # Save to local
        filename = f"minimax_{uuid.uuid4().hex}.mp3"
        file_path = OUTPUT_BASE_DIR / filename
        with open(file_path, "wb") as f:
            f.write(audio_response.content)

        logger.info(f"Saved generated music to: {file_path}")
        
        return {
            "success": True,
            "audio_url": f"/outputs/minimax/{filename}",
            "filename": filename
        }

    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code
        if status_code == 401:
            raise Exception("MiniMax APIキーが無効です。")
        elif status_code == 429:
            raise Exception("MiniMax APIのレート制限に達しました。しばらく待ってから再試行してください。")
        else:
            raise Exception(f"HTTP Error {status_code}: {str(e)}")
    except Exception as e:
        logger.error(f"Failed to generate music via MiniMax: {str(e)}")
        raise e
