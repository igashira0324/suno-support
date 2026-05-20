"""
ACE-Step routes — /acestep/*, /acestep/minimax/*, lyrics extraction.
"""

import json
import re
import shutil
import uuid
from pathlib import Path
from typing import Optional
from urllib.parse import quote

import requests
import torch
from fastapi import APIRouter, UploadFile, File, HTTPException, Request, Body
from pydantic import BaseModel

import acestep_service
from core.config import (
    logger,
    UPLOAD_DIR, MERGED_DIR,
    ACESTEP_SOURCE_DIR, ACESTEP_RUNTIME_SOURCE_DIR,
)
from core.paths import (
    resolve_web_path,
    normalize_acestep_audio_path,
    sync_acestep_runtime_source,
)
from core.download import download_audio_from_url

router = APIRouter(prefix="/acestep")


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class AceStepRequest(BaseModel):
    prompt: str = ""
    lyrics: str = ""
    thinking: bool = False
    inference_steps: int = 8
    shift: float = 1.0
    guidance_scale: float = 7.0
    infer_method: str = "ode"
    use_random_seed: bool = True
    seed: int = -1
    batch_size: int = 1
    duration: float = -1
    language: str = "en"
    model: str = "acestep-v15-xl-sft"
    sample_mode: bool = False
    sample_query: str = ""
    task_type: str = "text2music"
    audio_cover_strength: float = 0.8
    cover_repaint_use_lm: bool = True
    repainting_start: Optional[float] = None
    repainting_end: Optional[float] = None
    src_audio_path: Optional[str] = None
    use_adg: bool = False
    reference_audio_path: Optional[str] = None
    track_name: Optional[str] = None

class PostProcessRequest(BaseModel):
    file_url: str
    fade_duration: float = 3.0
    auto_trim: bool = True

class MinimaxRequest(BaseModel):
    lyrics: str
    prompt: str

class ExtractLyricsRequest(BaseModel):
    url: Optional[str] = None
    audio_path: Optional[str] = None
    language: str = "ja"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/upload-source")
async def acestep_upload_source(file: UploadFile = File(...)):
    """Upload source audio for ACE-Step cover generation or reference track."""
    try:
        ext = Path(file.filename).suffix or ".mp3"
        file_id = str(uuid.uuid4())
        filename = f"{file_id}{ext}"
        filepath = ACESTEP_SOURCE_DIR / filename
        
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return {"status": "success", "path": normalize_acestep_audio_path(str(filepath.resolve()))}
    except Exception as e:
        logger.error(f"Failed to upload source audio: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")


@router.post("/download-url")
async def acestep_download_url(request: Request):
    """Download audio from YouTube/URL, to be used as source or reference audio."""
    body = await request.json()
    url = body.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
        
    try:
        final_path = await download_audio_from_url(url, ACESTEP_SOURCE_DIR)
        return {"path": normalize_acestep_audio_path(str(final_path.resolve()))}
        
    except Exception as e:
        logger.error(f"Error downloading URL: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/llm-proxy")
async def acestep_llm_proxy(body: dict = Body(...)):
    """Proxy request to local LLM server to bypass browser CORS."""
    try:
        LLM_SERVER_URL = "http://127.0.0.1:8080/v1/chat/completions"
        
        logger.info(f"Proxying LLM request to: {LLM_SERVER_URL}")
        
        response = requests.post(LLM_SERVER_URL, json=body, timeout=120)
        
        if not response.ok:
            logger.error(f"Local LLM Proxy Error: {response.status_code} - {response.text}")
            raise HTTPException(status_code=response.status_code, detail=f"Local LLM Error: {response.text}")
            
        return response.json()
        
    except requests.exceptions.ConnectionError:
        logger.warning("Local LLM server is not running at 127.0.0.1:8080")
        raise HTTPException(status_code=503, detail="Local LLM server is not running")
    except Exception as e:
        logger.error(f"LLM Proxy Exception: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/minimax/generate")
async def generate_minimax(request: MinimaxRequest):
    """Generate music using MiniMax Music 2.5 API."""
    from minimax_service import generate_music_minimax
    try:
        if len(request.lyrics) > 3500:
            raise HTTPException(status_code=400, detail="歌詞が長すぎます（上限3500文字）。")
        if len(request.prompt) > 2000:
            raise HTTPException(status_code=400, detail="プロンプトが長すぎます（上限2000文字）。")

        result = generate_music_minimax(request.lyrics, request.prompt)
        return result
    except Exception as e:
        logger.error(f"MiniMax generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate")
async def acestep_generate(request: AceStepRequest):
    """Generate music using ACE-Step API."""
    src_audio_path = normalize_acestep_audio_path(request.src_audio_path)
    reference_audio_path = normalize_acestep_audio_path(request.reference_audio_path)

    result = acestep_service.release_task(
        request.prompt,
        request.lyrics,
        thinking=request.thinking,
        inference_steps=request.inference_steps,
        shift=request.shift,
        guidance_scale=request.guidance_scale,
        infer_method=request.infer_method,
        batch_size=request.batch_size,
        audio_duration=request.duration,
        vocal_language=request.language,
        model=request.model,
        sample_mode=request.sample_mode,
        sample_query=request.sample_query,
        seed=request.seed,
        task_type=request.task_type,
        audio_cover_strength=request.audio_cover_strength,
        cover_repaint_use_lm=request.cover_repaint_use_lm,
        repainting_start=request.repainting_start,
        repainting_end=request.repainting_end,
        src_audio_path=src_audio_path,
        use_adg=request.use_adg,
        reference_audio_path=reference_audio_path,
        track_name=request.track_name
    )
    
    if "error" in result and result["error"]:
        raise HTTPException(status_code=500, detail=result["error"])
    
    return result


@router.post("/post-process")
async def acestep_post_process(request: PostProcessRequest):
    """Post-process: detect beats, trim at last musical boundary, apply fade-out."""
    try:
        local_path = resolve_web_path(request.file_url)
        if not local_path.exists():
            raise HTTPException(status_code=404, detail=f"Audio file not found: {request.file_url}")

        import librosa
        import soundfile as sf
        import numpy as np

        logger.info(f"[PostProcess] Loading audio: {local_path}")
        y, sr = librosa.load(str(local_path), sr=None, mono=False)
        
        y_mono = librosa.to_mono(y) if y.ndim > 1 else y
        tempo, beats = librosa.beat.beat_track(y=y_mono, sr=sr, units='samples')
        
        duration_samples = y.shape[1] if y.ndim > 1 else len(y)
        original_duration = duration_samples / sr
        
        # 1. Audio Trim at beat boundary
        cut_point = duration_samples
        if request.auto_trim and len(beats) > 0:
            last_valid_beats = beats[beats < (duration_samples - int(0.1 * sr))]
            if len(last_valid_beats) > 0:
                cut_point = last_valid_beats[-1]
                
                if y.ndim > 1:
                    y = y[:, :cut_point]
                else:
                    y = y[:cut_point]
                duration_samples = cut_point
                logger.info(f"[PostProcess] Trimmed at beat: {cut_point/sr:.2f}s (from {original_duration:.2f}s)")

        # 2. Apply Fade out
        fade_samples = int(request.fade_duration * sr)
        if fade_samples > duration_samples:
            fade_samples = duration_samples // 4
            
        if fade_samples > 0:
            fade_curve = np.linspace(1.0, 0.0, fade_samples) ** 2
            if y.ndim > 1:
                y[:, -fade_samples:] *= fade_curve
            else:
                y[-fade_samples:] *= fade_curve
            logger.info(f"[PostProcess] Applied {request.fade_duration}s fade out")

        # 3. Save to MERGED_DIR
        processed_file_id = f"rp_{uuid.uuid4().hex[:8]}"
        processed_filename = f"{processed_file_id}.wav"
        processed_path = MERGED_DIR / processed_filename
        
        save_data = y.T if y.ndim > 1 else y
        sf.write(str(processed_path), save_data, sr)
        
        web_url = f"/outputs/merged/{processed_filename}"
        logger.info(f"[PostProcess] Saved to {web_url}")
        
        return {
            "status": "success",
            "url": web_url,
            "path": str(processed_path.resolve()),
            "original_duration": original_duration,
            "new_duration": duration_samples / sr,
            "tempo": float(tempo)
        }
    except Exception as e:
        logger.error(f"[PostProcess] Failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{task_id}")
async def acestep_status(task_id: str, request: Request):
    """Get the status of an ACE-Step generation task."""
    result = acestep_service.query_result(task_id)
    logger.info(f"[acestep_status] Raw query_result for {task_id}: status={result.get('status')}, error={result.get('error')}, keys={list(result.keys())}")
    
    status_map = {0: "processing", 1: "completed", 2: "failed"}
    raw_status = result.get("status")
    mapped_status = status_map.get(raw_status, "processing")
    
    raw_error = result.get("error") or None
    if mapped_status == "processing":
        raw_error = None
    
    harmonized = {
        "task_id": task_id,
        "status": mapped_status,
        "progress": 100 if raw_status == 1 else 0,
        "result": result.get("result"),
        "error": raw_error
    }
    
    if harmonized["status"] == "completed" and harmonized["result"]:
        hostname = request.url.hostname or "localhost"
        base_url = f"http://{hostname}:8101"
        
        output_files = []
        for item in harmonized["result"]:
            if item.get("file"):
                file_path = item["file"]
                
                if file_path.startswith("/"):
                    item["url"] = f"{base_url}{file_path}"
                elif file_path.startswith("http"):
                    item["url"] = file_path
                else:
                    item["url"] = f"{base_url}/v1/audio?path={quote(file_path)}"
                    
                output_files.append(item)
        harmonized["output_files"] = output_files

    return harmonized


# ---------------------------------------------------------------------------
# Lyrics extraction
# ---------------------------------------------------------------------------

@router.post("/extract-lyrics")
async def extract_lyrics(request: ExtractLyricsRequest):
    """
    Extract lyrics from a YouTube URL or audio file.
    Step 1: Try Suno API / YouTube captions/subtitles.
    Step 2: Fallback to Whisper speech recognition.
    """
    lyrics_text = None
    prompt_text = None
    method = None
    suno_match = None
    
    # Step 1: Try Suno extraction if it's a Suno URL
    if request.url:
        suno_match = re.search(r'suno\.com/song/([0-9a-fA-F-]{36})', request.url)
        if suno_match:
            song_id = suno_match.group(1)
            logger.info(f"Detected Suno URL. Attempting lyrics extraction for song: {song_id}")
            try:
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }

                # ATTEMPT 1: OG tags for title/style (quick, reliable)
                try:
                    from bs4 import BeautifulSoup
                    page_resp = requests.get(
                        f"https://suno.com/song/{song_id}",
                        headers=headers, timeout=15
                    )
                    if page_resp.ok:
                        soup = BeautifulSoup(page_resp.text, 'html.parser')
                        og_title = soup.find("meta", property="og:title")
                        if og_title and og_title.get("content"):
                            logger.info(f"Suno OG title: {og_title['content']}")
                except Exception as og_err:
                    logger.warning(f"OG tag extraction failed: {og_err}")

                # ATTEMPT 2: HTML Scraping for lyrics (regex patterns)
                lyrics_text, prompt_text, method = _scrape_suno_lyrics(song_id, headers)

                if lyrics_text:
                    logger.info(f"Suno extraction successful ({method}, {len(lyrics_text)} chars)")
                    return {"lyrics": lyrics_text, "prompt": prompt_text, "method": method}
                
                logger.info("Suno direct extraction failed. Falling back to Whisper/ASR...")
            except Exception as e:
                logger.warning(f"Suno extraction process error: {e}")

    # Step 2: Try YouTube subtitles via yt-dlp
    if not lyrics_text and request.url and not suno_match:
        try:
            import yt_dlp
            
            logger.info(f"Attempting subtitle extraction from: {request.url}")
            
            ydl_opts = {
                'skip_download': True,
                'writesubtitles': True,
                'writeautomaticsub': True,
                'subtitleslangs': [request.language, 'en', 'ja'],
                'noplaylist': True,
                'quiet': True,
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(request.url, download=False)
                
                subs = info.get('subtitles', {}) or {}
                auto_subs = info.get('automatic_captions', {}) or {}
                
                sub_entries = None
                sub_source = None
                for lang in [request.language, 'ja', 'en']:
                    if lang in subs and subs[lang]:
                        sub_entries = subs[lang]
                        sub_source = f"manual/{lang}"
                        break
                    if lang in auto_subs and auto_subs[lang]:
                        sub_entries = auto_subs[lang]
                        sub_source = f"auto/{lang}"
                        break
                
                if sub_entries:
                    vtt_entry = next((e for e in sub_entries if e.get('ext') == 'vtt'), None)
                    
                    if not vtt_entry:
                        for e in sub_entries:
                            url = e.get('url', '')
                            if 'fmt=vtt' in url or url.endswith('.vtt'):
                                vtt_entry = e
                                break
                    
                    if vtt_entry:
                        sub_url = vtt_entry.get('url')
                        if sub_url:
                            resp = requests.get(sub_url, timeout=15)
                            resp.raise_for_status()
                            raw_sub = resp.text
                            
                            if raw_sub.strip().startswith('WEBVTT') or '-->' in raw_sub[:500]:
                                lyrics_text = _parse_subtitle_to_lyrics(raw_sub)
                                method = "subtitle"
                                logger.info(f"Subtitle extraction successful ({sub_source}, {len(lyrics_text)} chars)")
                        
        except Exception as e:
            logger.warning(f"Subtitle extraction failed: {e}")
    
    # Step 3: Fallback to Whisper
    if not lyrics_text:
        audio_file_path = request.audio_path
        
        if not audio_file_path and request.url:
            try:
                temp_dir = ACESTEP_SOURCE_DIR / f"whisper_{uuid.uuid4()}"
                temp_dir.mkdir(parents=True, exist_ok=True)
                
                suno_dl_match = re.search(r'suno\.com/song/([0-9a-fA-F-]{36})', request.url)
                if suno_dl_match:
                    song_id = suno_dl_match.group(1)
                    direct_url = f"https://cdn1.suno.ai/{song_id}.mp3"
                    logger.info(f"Detected Suno URL for Whisper. Downloading directly from: {direct_url}")
                    
                    output_template = str(temp_dir / "whisper_audio.mp3")
                    response = requests.get(direct_url, stream=True, timeout=30)
                    response.raise_for_status()
                    with open(output_template, 'wb') as f:
                        for chunk in response.iter_content(chunk_size=8192):
                            f.write(chunk)
                else:
                    import yt_dlp
                    ydl_opts = {
                        'format': 'bestaudio/best',
                        'postprocessors': [{
                            'key': 'FFmpegExtractAudio',
                            'preferredcodec': 'mp3',
                            'preferredquality': '128',
                        }],
                        'outtmpl': str(temp_dir / 'whisper_audio'),
                        'noplaylist': True,
                        'quiet': True,
                    }
                    
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([request.url])
                
                downloaded = list(temp_dir.glob("*.*"))
                downloaded = [f for f in downloaded if f.suffix.lower() in ('.mp3', '.wav', '.m4a', '.ogg', '.flac')]
                if downloaded:
                    audio_file_path = str(downloaded[0])
                else:
                    raise Exception("Audio download for Whisper failed")
                    
            except Exception as e:
                logger.error(f"Audio download for Whisper failed: {e}")
                raise HTTPException(status_code=500, detail=f"Could not download audio: {e}")
        
        if audio_file_path:
            try:
                logger.info(f"Starting Whisper transcription: {audio_file_path}")
                try:
                    import whisper
                except ImportError:
                    raise HTTPException(
                        status_code=500, 
                        detail="Whisper is not installed. Please install openai-whisper."
                    )
                
                model = whisper.load_model("small", device="cuda" if torch.cuda.is_available() else "cpu")
                result = model.transcribe(
                    audio_file_path, 
                    language=request.language if request.language != "auto" else None,
                    task="transcribe"
                )
                
                lyrics_text = _structure_whisper_output(result)
                method = "whisper"
                logger.info(f"Whisper transcription successful ({len(lyrics_text)} chars)")
                
                del model
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                
            except Exception as e:
                logger.error(f"Whisper transcription failed: {e}")
                raise HTTPException(status_code=500, detail=f"Lyrics extraction failed: {e}")
    
    if not lyrics_text:
        raise HTTPException(status_code=404, detail="Could not extract lyrics from the provided source.")
    
    # Cleanup temp files — sweep ALL leftover whisper temp dirs
    for whisper_temp in ACESTEP_SOURCE_DIR.glob("whisper_*"):
        if whisper_temp.is_dir():
            shutil.rmtree(whisper_temp, ignore_errors=True)
    
    return {"lyrics": lyrics_text, "prompt": prompt_text, "method": method}


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _scrape_suno_lyrics(song_id: str, headers: dict):
    """Scrape lyrics from Suno HTML page. Returns (lyrics, prompt, method) or (None, None, None)."""
    try:
        logger.info(f"Suno API failed. Trying HTML scraping for song: {song_id}")
        page_url = f"https://suno.com/song/{song_id}"
        response = requests.get(page_url, headers=headers, timeout=10)
        if not response.ok:
            return None, None, None
            
        html = response.text
        lyrics_text = None
        prompt_text = None
        method = None
        
        # Pattern 1: Regex for prompt field
        prompt_match = re.search(r'\"prompt\":\"(.*?)(?<!\\)\"', html)
        if prompt_match:
            try:
                raw_prompt = prompt_match.group(1)
                lyrics_text = raw_prompt.replace('\\n', '\n').replace('\\"', '"')
                if '\\u' in lyrics_text:
                    try:
                        lyrics_text = raw_prompt.encode('utf-8').decode('unicode_escape')
                    except:
                        pass
                method = "suno_scrape_regex_v2"
                logger.info(f"Suno lyrics found via HTML regex v2: {len(lyrics_text)} chars")
                
                tags_match = re.search(r'\"tags\":\"(.*?)(?<!\\)\"', html)
                if tags_match:
                    try:
                        raw_tags = tags_match.group(1)
                        prompt_text = raw_tags.replace('\\n', '\n').replace('\\"', '"')
                    except:
                        pass
            except Exception as e:
                logger.warning(f"Regex v2 decoding error: {e}")
        
        # Pattern 2: Characteristic block
        if not lyrics_text:
            suno_block_match = re.search(r'\"(\\n|\\r| )*(\[start\].*?\[end\])\"', html, re.DOTALL)
            if suno_block_match:
                raw_prompt = suno_block_match.group(2)
                lyrics_text = raw_prompt.replace('\\n', '\n').replace('\\"', '"').replace('\\r', '\r').strip()
                method = "suno_scrape_block"

        # Pattern 3: RSC reference
        if not lyrics_text:
            ref_match = re.search(r'\"prompt\":\"(\$[0-9]+)\"', html)
            if ref_match:
                ref_id = ref_match.group(1).replace('$', '')
                ref_data_match = re.search(rf'\"{ref_id}:T[0-9]+,(.*?)\"', html, re.DOTALL)
                if ref_data_match:
                    raw_prompt = ref_data_match.group(1)
                    lyrics_text = raw_prompt.replace('\\n', '\n').replace('\\"', '"').replace('\\r', '\r').strip()
                    method = "suno_scrape_ref"

        # Pattern 4: Legacy __NEXT_DATA__
        if not lyrics_text:
            next_data_match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
            if next_data_match:
                try:
                    next_data = json.loads(next_data_match.group(1))
                    
                    def find_prompt(obj):
                        if isinstance(obj, dict):
                            if 'prompt' in obj and isinstance(obj['prompt'], str) and len(obj['prompt'].strip()) > 10:
                                return obj['prompt'].strip()
                            for v in obj.values():
                                res = find_prompt(v)
                                if res: return res
                        elif isinstance(obj, list):
                            for item in obj:
                                res = find_prompt(item)
                                if res: return res
                        return None
                    
                    scraped_prompt = find_prompt(next_data)
                    if scraped_prompt:
                        lyrics_text = scraped_prompt
                        method = "suno_scrape_next"
                        
                        def find_tags(obj):
                            if isinstance(obj, dict):
                                if 'tags' in obj and isinstance(obj['tags'], str) and len(obj['tags'].strip()) > 0:
                                    return obj['tags'].strip()
                                for v in obj.values():
                                    res = find_tags(v)
                                    if res: return res
                            elif isinstance(obj, list):
                                for item in obj:
                                    res = find_tags(item)
                                    if res: return res
                            return None
                        
                        prompt_text = find_tags(next_data)
                except Exception as json_err:
                    logger.warning(f"Suno NEXT_DATA parse error: {json_err}")
    except Exception as scrape_err:
        logger.warning(f"Suno HTML scraping failed: {scrape_err}")
    
    return lyrics_text, prompt_text, method


def _parse_subtitle_to_lyrics(raw_sub: str) -> str:
    """Parse VTT/SRT subtitle content into clean lyrics text."""
    lines = raw_sub.split('\n')
    lyrics_lines = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if line.startswith('WEBVTT') or line.startswith('NOTE') or line.startswith('Kind:') or line.startswith('Language:'):
            continue
        if re.match(r'^\d+$', line):
            continue
        if re.match(r'[\d:.,\-\s]+-->[\d:.,\-\s]+', line):
            continue
        
        line = re.sub(r'<[^>]+>', '', line)
        line = re.sub(r'\[.*?\]', '', line)
        line = line.strip()
        
        if not line:
            continue
        if line in ["He.", "you", "Music", "音楽"]:
            continue
        line = re.sub(r'He\.$', '', line).strip()
        if not line:
            continue
        if lyrics_lines and line == lyrics_lines[-1]:
            continue
            
        lyrics_lines.append(line)
    
    return '\n'.join(lyrics_lines)


def _structure_whisper_output(result: dict) -> str:
    """Convert Whisper output to structured lyrics with section tags."""
    segments = result.get('segments', [])
    if not segments:
        return result.get('text', '')
    
    lyrics_lines = []
    current_section_start = 0
    section_count = 0
    SECTION_DURATION = 30
    
    section_labels = ['[Intro]', '[Verse 1]', '[Pre-Chorus]', '[Chorus]', 
                      '[Verse 2]', '[Pre-Chorus]', '[Chorus]', '[Bridge]', 
                      '[Chorus]', '[Outro]']
    
    for seg in segments:
        seg_start = seg.get('start', 0)
        text = seg.get('text', '').strip()
        
        if not text:
            continue
        
        if seg_start - current_section_start >= SECTION_DURATION:
            if section_count < len(section_labels):
                lyrics_lines.append('')
                lyrics_lines.append(section_labels[section_count])
            section_count += 1
            current_section_start = seg_start
        elif section_count == 0:
            lyrics_lines.append(section_labels[0])
            section_count += 1
        
        lyrics_lines.append(text)
    
    return '\n'.join(lyrics_lines)
