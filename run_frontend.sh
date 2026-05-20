#!/bin/bash
# run_frontend.sh

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

cd "$SCRIPT_DIR"

echo "Starting Suno Support Frontend..."

export CHOKIDAR_USEPOLLING="${CHOKIDAR_USEPOLLING:-1}"
export CHOKIDAR_INTERVAL="${CHOKIDAR_INTERVAL:-300}"

npm run dev
