import socket
import ipaddress
import re
import shutil
import subprocess
import sys
import uuid
from pathlib import Path
from urllib.parse import urlparse

import requests

from .config import logger


def is_safe_url(url: str) -> bool:
    """Validate that the URL scheme is HTTP/HTTPS and host does not resolve to private/local networks (SSRF prevention)."""
    try:
        parsed = urlparse(url)
        if not parsed.scheme or parsed.scheme.lower() not in ("http", "https"):
            return False
        
        hostname = parsed.hostname
        if not hostname:
            return False
        
        # Check if raw IP and private
        try:
            ip = ipaddress.ip_address(hostname)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_unspecified:
                return False
        except ValueError:
            pass

        # Resolve hostname to IPs
        addr_info = socket.getaddrinfo(hostname, None)
        for family, _, _, _, sockaddr in addr_info:
            ip_str = sockaddr[0]
            ip = ipaddress.ip_address(ip_str)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_unspecified or ip.is_multicast:
                return False
                
        return True
    except Exception as e:
        logger.error(f"SSRF validation failed for {url}: {e}")
        return False


async def download_audio_from_url(url: str, output_dir: Path) -> Path:
    """
    Download audio from a URL to a directory.
    Supports YouTube (via yt-dlp) and Suno (direct CDN).
    Returns the Path to the downloaded file.
    """
    if not is_safe_url(url):
        raise ValueError(f"URL is not allowed (SSRF Protection): {url}")
    file_id = str(uuid.uuid4())
    temp_dir = output_dir / f"ytdlp_temp_{file_id}"
    temp_dir.mkdir(parents=True, exist_ok=True)

    output_template = str(temp_dir / f"{file_id}.%(ext)s")

    # Check if it is a Suno URL
    suno_match = re.search(r'suno\.com/song/([0-9a-fA-F-]{36})', url)
    if suno_match:
        song_id = suno_match.group(1)
        direct_url = f"https://cdn1.suno.ai/{song_id}.mp3"
        logger.info(f"Detected Suno URL. Downloading directly from: {direct_url}")

        target_file = temp_dir / f"{file_id}.mp3"

        try:
            response = requests.get(direct_url, stream=True, timeout=30)
            response.raise_for_status()
            with open(target_file, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
        except Exception as e:
            raise Exception(f"Failed to download Suno MP3: {e}")

    else:
        cmd = [
            sys.executable, "-m", "yt_dlp",
            "--no-playlist", "-x",
            "--audio-format", "mp3",
            "--audio-quality", "0",
            "-o", str(output_template),
            url,
        ]

        logger.info(f"Downloading audio from URL via yt-dlp: {url}")
        try:
            result = subprocess.run(cmd, check=True, capture_output=True, text=True)
            logger.debug(f"yt-dlp output: {result.stdout}")
        except subprocess.CalledProcessError as e:
            logger.error(f"yt-dlp failed with exit code {e.returncode}")
            logger.error(f"yt-dlp stderr: {e.stderr}")
            err_msg = e.stderr or str(e)
            if "Forbidden" in err_msg or "403" in err_msg:
                raise Exception(
                    "YouTube access forbidden (403). Try again or check if the video is restricted."
                )
            elif "not found" in err_msg or "404" in err_msg:
                raise Exception("YouTube video not found (404).")
            else:
                raise Exception(f"yt-dlp download failed: {err_msg[:200]}...")

    # Find the downloaded file
    downloaded_files = list(temp_dir.glob(f"{file_id}.*"))
    if not downloaded_files:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise Exception("Download completed but file not found")

    source_file = downloaded_files[0]

    # Move to final location
    final_path = output_dir / source_file.name
    shutil.move(str(source_file), str(final_path))

    # Cleanup temp dir
    shutil.rmtree(temp_dir, ignore_errors=True)

    return final_path
