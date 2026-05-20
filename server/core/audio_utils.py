import os
import shutil
import logging
from pathlib import Path
from typing import Optional
from pydub import AudioSegment

logger = logging.getLogger("SunoArchitect.AudioUtils")

def transcode_to_mp3(src_path: Path, dst_path: Optional[Path] = None, bitrate: str = "320k") -> Path:
    """
    Convert audio file to MP3 using pydub/ffmpeg.
    If src is already mp3, returns src_path unless dst_path is specified.
    """
    src_path = Path(src_path)

    if dst_path is None:
        dst_path = src_path.with_suffix(".mp3")
    else:
        dst_path = Path(dst_path)

    dst_path.parent.mkdir(parents=True, exist_ok=True)

    # Return if destination already exists, is not empty, and is newer than source
    if dst_path.exists() and dst_path.stat().st_size > 0:
        if dst_path.suffix.lower() == ".mp3" and dst_path.stat().st_mtime >= src_path.stat().st_mtime:
            return dst_path

    # If already mp3, just copy to destination and return
    if src_path.suffix.lower() == ".mp3":
        if src_path.resolve() == dst_path.resolve():
            return src_path
        shutil.copy2(src_path, dst_path)
        return dst_path

    # Transcode using pydub
    try:
        logger.info(f"Transcoding {src_path} to {dst_path} (bitrate={bitrate})...")
        audio = AudioSegment.from_file(str(src_path))
        audio.export(str(dst_path), format="mp3", bitrate=bitrate)
        return dst_path
    except Exception as e:
        logger.error(f"Error transcoding to mp3: {src_path} -> {dst_path}: {e}")
        raise
