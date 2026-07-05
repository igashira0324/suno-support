import os
import uuid
import re
import requests
import subprocess
import sys
import shutil
import urllib.parse
from pathlib import Path
from .config import settings

def _resolve_within(base: Path, relative: str) -> Path:
    """Resolve `relative` under `base`, refusing '..' escapes out of the base dir."""
    base_resolved = base.resolve()
    candidate = (base_resolved / relative).resolve()
    if candidate != base_resolved and not str(candidate).startswith(str(base_resolved) + os.sep):
        raise ValueError(f"Path escapes {base_resolved}: {relative}")
    return candidate


def resolve_web_path(web_path: str) -> Path:
    if not web_path: return Path("")

    # 1. Handle ACE-STEP specific format: .../v1/audio?path=...
    # (absolute paths are trusted here: this is local inter-service plumbing)
    if "path=" in web_path:
        query = urllib.parse.urlparse(web_path).query
        params = urllib.parse.parse_qs(query)
        if "path" in params:
            file_path_str = urllib.parse.unquote(params["path"][0])
            return Path(file_path_str)

    # 2. Standard path handling: Strip full URLs to just the path portion
    cleaned_path = re.sub(r'^https?://[^/]+', '', web_path)
    cleaned_path = urllib.parse.unquote(cleaned_path)

    if cleaned_path.startswith("/uploads/"):
        return _resolve_within(settings.upload_dir, cleaned_path.replace("/uploads/", "", 1))
    elif cleaned_path.startswith("/outputs/"):
        return _resolve_within(settings.output_dir, cleaned_path.replace("/outputs/", "", 1))
    else:
        # Fallback to project root or absolute path
        p = Path(cleaned_path)
        if p.is_absolute():
            return p
        return (settings.project_dir / cleaned_path.lstrip("/")).resolve()

async def download_audio_from_url(url: str, output_dir: Path) -> Path:
    file_id = str(uuid.uuid4())
    temp_dir = output_dir / f"ytdlp_temp_{file_id}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    output_template = str(temp_dir / f"{file_id}.%(ext)s")
    
    suno_match = re.search(r'suno\.com/song/([0-9a-fA-F-]{36})', url)
    if suno_match:
        song_id = suno_match.group(1)
        direct_url = f"https://cdn1.suno.ai/{song_id}.mp3"
        target_file = temp_dir / f"{file_id}.mp3"
        response = requests.get(direct_url, stream=True, timeout=30)
        response.raise_for_status()
        with open(target_file, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
    else:
        cmd = [sys.executable, "-m", "yt_dlp", "--no-playlist", "-x", "--audio-format", "mp3", "--audio-quality", "0", "-o", str(output_template), url]
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    
    downloaded_files = list(temp_dir.glob(f"{file_id}.*"))
    if not downloaded_files:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise Exception("Download completed but file not found")
        
    source_file = downloaded_files[0]
    final_path = output_dir / source_file.name
    shutil.move(str(source_file), str(final_path))
    shutil.rmtree(temp_dir, ignore_errors=True)
    return final_path

def parse_subtitle_to_lyrics(raw_sub: str) -> str:
    lines = raw_sub.split('\n')
    lyrics_lines = []
    for line in lines:
        line = line.strip()
        if not line: continue
        if line.startswith('WEBVTT') or line.startswith('NOTE') or line.startswith('Kind:') or line.startswith('Language:'):
            continue
        if re.match(r'^\d+$', line): continue
        if re.match(r'[\d:.,\-\s]+-->[\d:.,\-\s]+', line): continue
        line = re.sub(r'<[^>]+>', '', line)
        line = re.sub(r'\[.*?\]', '', line)
        line = line.strip()
        if not line or line in ["He.", "you", "Music", "音楽"]: continue
        line = re.sub(r'He\.$', '', line).strip()
        if not line: continue
        if lyrics_lines and line == lyrics_lines[-1]: continue
        lyrics_lines.append(line)
    return '\n'.join(lyrics_lines)

def structure_whisper_output(result: dict) -> str:
    segments = result.get('segments', [])
    if not segments: return result.get('text', '')
    lyrics_lines = []
    current_section_start = 0
    section_count = 0
    SECTION_DURATION = 30
    section_labels = ['[Intro]', '[Verse 1]', '[Pre-Chorus]', '[Chorus]', '[Verse 2]', '[Pre-Chorus]', '[Chorus]', '[Bridge]', '[Chorus]', '[Outro]']
    for seg in segments:
        seg_start = seg.get('start', 0)
        if seg_start - current_section_start > SECTION_DURATION:
            if section_count < len(section_labels):
                lyrics_lines.append(f"\n{section_labels[section_count]}")
                section_count += 1
                current_section_start = seg_start
        lyrics_lines.append(seg.get('text', '').strip())
    return '\n'.join(lyrics_lines)
