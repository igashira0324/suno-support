#!/bin/bash
# run_acestep.sh
# Customized for Suno Support backend (expects port 8101)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$SCRIPT_DIR/scratch/ffmpeg-7.0.2-arm64-static:$PATH"
ACE_STEP_DIR="$SCRIPT_DIR/ace-step"

echo "Starting ACE-Step API Server on port 8101..."

export PATH="$HOME/.local/bin:$PATH"
export ACESTEP_CONFIG_PATH="${ACESTEP_CONFIG_PATH:-acestep-v15-xl-sft}"
export ACESTEP_CONFIG_PATH2="${ACESTEP_CONFIG_PATH2:-acestep-v15-xl-base}"
export ACESTEP_LM_MODEL_PATH="${ACESTEP_LM_MODEL_PATH:-acestep-5Hz-lm-4B}"
export ACESTEP_LM_BACKEND="${ACESTEP_LM_BACKEND:-pt}"
export ACESTEP_NO_INIT="${ACESTEP_NO_INIT:-false}"

cd "$ACE_STEP_DIR"

# Initialize environment if not exists
if [ ! -d ".venv" ]; then
    echo "Setting up ACE-Step environment with uv..."
    uv sync
fi

# Start server
uv run --no-sync acestep-api --host 127.0.0.1 --port 8101 --lm-model-path "$ACESTEP_LM_MODEL_PATH"
