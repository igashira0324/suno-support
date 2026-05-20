#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="${SCRIPT_DIR}/.run"
PID_FILE="${RUN_DIR}/music-local.pid"
FIRECRAWL_DIR="${FIRECRAWL_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)/firecrawl}"

kill_listener_on_port() {
    local port="$1"
    local pids
    pids="$(ss -ltnp 2>/dev/null | awk -v p=":${port}" '
        $4 ~ p {
            if (match($0, /pid=[0-9]+/)) {
                pid = substr($0, RSTART + 4, RLENGTH - 4)
                print pid
            }
        }
    ' | sort -u)"

    if [[ -n "${pids}" ]]; then
        while IFS= read -r pid; do
            [[ -n "${pid}" ]] || continue
            kill "${pid}" 2>/dev/null || true
        done <<< "${pids}"
    fi
}

if [[ -f "${PID_FILE}" ]]; then
    pid="$(cat "${PID_FILE}")"
    if kill -0 "${pid}" 2>/dev/null; then
        kill "${pid}"
        echo "Stopped music stack launcher: ${pid}"
    else
        echo "Launcher PID ${pid} is not running."
    fi
    rm -f "${PID_FILE}"
else
    echo "No launcher PID file found."
fi

kill_listener_on_port 3300
kill_listener_on_port 8100
kill_listener_on_port 8101

if [[ -d "${FIRECRAWL_DIR}" ]]; then
    (
        cd "${FIRECRAWL_DIR}"
        docker compose stop >/dev/null 2>&1 || true
    )
    echo "Stopped FireCrawl containers."
fi

echo ""
echo "[INFO] ACE-Step music stack has been stopped."
echo "[INFO] Resources (VRAM/RAM) are now released."
echo "[INFO] ComfyUI can now resume full idling state."

