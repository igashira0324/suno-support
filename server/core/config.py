"""
Shared directory constants, logger setup, and task store.
All route modules import from here to avoid circular dependencies.
"""

import logging
from pathlib import Path
from typing import Dict

# --- Directories -----------------------------------------------------------

SERVER_DIR = Path(__file__).resolve().parent.parent          # server/
PROJECT_DIR = SERVER_DIR.parent                              # music/
UPLOAD_DIR = PROJECT_DIR / "uploads"
OUTPUT_DIR = PROJECT_DIR / "outputs"
YUE_OUTPUT_DIR = OUTPUT_DIR / "yue_generations"
SEPARATION_DIR = OUTPUT_DIR / "separated"
MINIMAX_OUTPUT_DIR = OUTPUT_DIR / "minimax"
MERGED_DIR = OUTPUT_DIR / "merged"
ACESTEP_SOURCE_DIR = UPLOAD_DIR / "acestep_source"
ACESTEP_RUNTIME_SOURCE_DIR = PROJECT_DIR / "ace-step" / "uploads" / "acestep_source"

# Ensure all required directories exist
for d in (
    UPLOAD_DIR, OUTPUT_DIR, YUE_OUTPUT_DIR, SEPARATION_DIR,
    MINIMAX_OUTPUT_DIR, MERGED_DIR, ACESTEP_SOURCE_DIR,
    ACESTEP_RUNTIME_SOURCE_DIR,
):
    d.mkdir(parents=True, exist_ok=True)

# --- Logger ----------------------------------------------------------------

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SunoArchitect")

logger.info(f"SERVER_DIR: {SERVER_DIR}")
logger.info(f"PROJECT_DIR: {PROJECT_DIR}")
logger.info(f"UPLOAD_DIR: {UPLOAD_DIR}")
logger.info(f"OUTPUT_DIR: {OUTPUT_DIR}")

# --- In-memory task store --------------------------------------------------

tasks: Dict[str, dict] = {}
