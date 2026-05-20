#!/bin/bash
# run_backend.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARE_PROXY_DIR="${HOME}/share"

if [[ -f "${SHARE_PROXY_DIR}/proxy_common.sh" ]]; then
    # shellcheck disable=SC1091
    source "${SHARE_PROXY_DIR}/proxy_common.sh"
    load_project_proxy_env "${SHARE_PROXY_DIR}"
else
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/proxy_common.sh"
    load_project_proxy_env "$SCRIPT_DIR"
fi

export PATH="$SCRIPT_DIR/scratch/ffmpeg-7.0.2-arm64-static:$PATH"
cd "$SCRIPT_DIR/server"

echo "Starting Suno Support Backend on port 8100..."

source venv/bin/activate
python main.py
