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


def is_safe_path(path: Path | str) -> bool:
    """Check if the path is a descendant of the PROJECT_DIR to prevent path traversal."""
    try:
        resolved = Path(path).resolve()
        project_resolved = PROJECT_DIR.resolve()
        return resolved.parts[:len(project_resolved.parts)] == project_resolved.parts
    except Exception:
        return False


def resolve_web_path(web_path: str) -> Path:
    """Convert a frontend web-path or ACE-STEP URL to a local filesystem Path."""
    # 1. Handle ACE-STEP specific format: .../v1/audio?path=...
    if "path=" in web_path:
        query = urllib.parse.urlparse(web_path).query
        params = urllib.parse.parse_qs(query)
        if "path" in params:
            file_path_str = urllib.parse.unquote(params["path"][0])
            resolved_path = Path(file_path_str)
            if not is_safe_path(resolved_path):
                raise ValueError(f"Access denied: path outside project directory: {file_path_str}")
            return resolved_path

    # 2. Standard path handling: Strip full URLs to just the path portion
    cleaned_path = re.sub(r'^https?://[^/]+', '', web_path)
    cleaned_path = urllib.parse.unquote(cleaned_path)

    if cleaned_path.startswith("/uploads/"):
        resolved_path = UPLOAD_DIR / cleaned_path.replace("/uploads/", "")
    elif cleaned_path.startswith("/outputs/"):
        resolved_path = OUTPUT_DIR / cleaned_path.replace("/outputs/", "")
    else:
        # Fallback
        if ":" in cleaned_path or cleaned_path.startswith(str(PROJECT_DIR.anchor)):
            resolved_path = Path(cleaned_path)
        else:
            resolved_path = (PROJECT_DIR / cleaned_path.lstrip("/")).resolve()

    if not is_safe_path(resolved_path):
        raise ValueError(f"Access denied: path outside project directory: {cleaned_path}")
    return resolved_path


def resolve_fs_path(web_path: str) -> Path:
    """Resolve a simple /uploads/ or /outputs/ web-path to filesystem path."""
    if web_path.startswith("/uploads/"):
        resolved_path = UPLOAD_DIR / web_path.replace("/uploads/", "")
    elif web_path.startswith("/outputs/"):
        resolved_path = OUTPUT_DIR / web_path.replace("/outputs/", "")
    else:
        resolved_path = Path(web_path)
        
    if not is_safe_path(resolved_path):
        raise ValueError(f"Access denied: path outside project directory: {web_path}")
    return resolved_path


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
