"""
Path resolution and validation helpers.
"""

import re
import shutil
import urllib.parse
from pathlib import Path

from .config import (
    PROJECT_DIR, UPLOAD_DIR, OUTPUT_DIR,
    ACESTEP_SOURCE_DIR, ACESTEP_RUNTIME_SOURCE_DIR,
)


def resolve_web_path(web_path: str) -> Path:
    """Convert a frontend web-path or ACE-STEP URL to a local filesystem Path."""
    # 1. Handle ACE-STEP specific format: .../v1/audio?path=...
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
        return UPLOAD_DIR / cleaned_path.replace("/uploads/", "")
    elif cleaned_path.startswith("/outputs/"):
        return OUTPUT_DIR / cleaned_path.replace("/outputs/", "")
    else:
        # Fallback
        if ":" in cleaned_path or cleaned_path.startswith(str(PROJECT_DIR.anchor)):
            return Path(cleaned_path)
        else:
            return (PROJECT_DIR / cleaned_path.lstrip("/")).resolve()


def resolve_fs_path(web_path: str) -> Path:
    """Resolve a simple /uploads/ or /outputs/ web-path to filesystem path."""
    if web_path.startswith("/uploads/"):
        return UPLOAD_DIR / web_path.replace("/uploads/", "")
    elif web_path.startswith("/outputs/"):
        return OUTPUT_DIR / web_path.replace("/outputs/", "")
    return Path(web_path)


def sync_acestep_runtime_source(filename: str) -> str:
    """Ensure source audio exists under ace-step/uploads for ACE-Step API."""
    source_path = ACESTEP_SOURCE_DIR / filename
    runtime_path = ACESTEP_RUNTIME_SOURCE_DIR / filename

    if source_path.exists() and not runtime_path.exists():
        shutil.copy2(source_path, runtime_path)

    return f"uploads/acestep_source/{filename}"


def normalize_acestep_audio_path(path_value: str | None) -> str | None:
    """Convert local absolute paths to project-relative paths for ACE-Step."""
    if not path_value:
        return path_value

    candidate = Path(path_value)
    if not candidate.is_absolute():
        normalized = path_value.replace("\\", "/")
        if normalized.startswith("uploads/acestep_source/"):
            filename = Path(normalized).name
            return sync_acestep_runtime_source(filename)
        return normalized

    try:
        relative = candidate.resolve().relative_to(PROJECT_DIR.resolve())
        normalized = relative.as_posix()
        if normalized.startswith("uploads/acestep_source/"):
            return sync_acestep_runtime_source(candidate.name)
        return normalized
    except ValueError:
        return path_value
