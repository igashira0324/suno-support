#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARE_PROXY_DIR="${HOME}/share"
LOG_DIR="${SCRIPT_DIR}/.logs/local"
RUN_DIR="${SCRIPT_DIR}/.run"
PID_FILE="${RUN_DIR}/music-local.pid"
FIRECRAWL_DIR="${FIRECRAWL_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)/firecrawl}"

FRONTEND_PORT=3300
BACKEND_PORT=8100
ACESTEP_PORT=8101
FIRECRAWL_PORT=3002

if [[ -f "${SHARE_PROXY_DIR}/proxy_common.sh" ]]; then
    # shellcheck disable=SC1091
    source "${SHARE_PROXY_DIR}/proxy_common.sh"
    load_project_proxy_env "${SHARE_PROXY_DIR}"
else
    # shellcheck disable=SC1091
    source "${SCRIPT_DIR}/proxy_common.sh"
    load_project_proxy_env "${SCRIPT_DIR}"
fi

mkdir -p "${LOG_DIR}" "${RUN_DIR}"

PIDS=()
TAIL_PIDS=()
STARTED_FIRECRAWL=0

is_pid_running() {
    local pid="$1"
    kill -0 "${pid}" 2>/dev/null
}

is_port_listening() {
    local port="$1"
    ss -ltn "( sport = :${port} )" | awk 'NR>1 { found=1 } END { exit(found ? 0 : 1) }'
}

wait_for_port() {
    local port="$1"
    local label="$2"
    local timeout="${3:-90}"
    local elapsed=0

    while (( elapsed < timeout )); do
        if is_port_listening "${port}"; then
            printf '[OK] %s is listening on port %s\n' "${label}" "${port}"
            return 0
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    printf '[WARN] %s did not become ready on port %s within %ss\n' "${label}" "${port}" "${timeout}" >&2
    return 1
}

release_comfyui_resources() {
    local comfy_port=8188
    if is_port_listening "${comfy_port}"; then
        echo "[INFO] Requesting ComfyUI (port ${comfy_port}) to release resources..."
        # POST /unload_models and /free to clear VRAM and cache
        curl -s -X POST "http://127.0.0.1:${comfy_port}/unload_models" > /dev/null || true
        curl -s -X POST "http://127.0.0.1:${comfy_port}/free" > /dev/null || true
        echo "[OK] Resource release requested."
    fi
}


start_component() {
    local name="$1"
    local logfile="$2"
    shift 2

    : > "${logfile}"
    setsid "$@" > "${logfile}" 2>&1 &
    local component_pid="$!"
    PIDS+=("${component_pid}")

    tail -n 0 -F "${logfile}" 2>/dev/null | sed "s/^/[${name}] /" &
    TAIL_PIDS+=("$!")
}

cleanup() {
    local exit_code=$?

    for pid in "${TAIL_PIDS[@]:-}"; do
        if is_pid_running "${pid}"; then
            kill "${pid}" 2>/dev/null || true
        fi
    done

    for pid in "${PIDS[@]:-}"; do
        if is_pid_running "${pid}"; then
            kill -- -"${pid}" 2>/dev/null || kill "${pid}" 2>/dev/null || true
        fi
    done

    wait || true
    rm -f "${PID_FILE}"

    if (( STARTED_FIRECRAWL == 1 )) && [[ -d "${FIRECRAWL_DIR}" ]]; then
        (
            cd "${FIRECRAWL_DIR}"
            docker compose stop >/dev/null 2>&1 || true
        )
    fi

    exit "${exit_code}"
}

trap cleanup INT TERM EXIT

if [[ -f "${PID_FILE}" ]]; then
    existing_pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
    if [[ -n "${existing_pid}" ]] && is_pid_running "${existing_pid}"; then
        echo "music stack is already running with PID ${existing_pid}. Stop it first." >&2
        exit 1
    fi
    rm -f "${PID_FILE}"
fi

echo "$$" > "${PID_FILE}"

echo "[INFO] Proxy profile: ${PROXY_PROFILE:-unset}"
echo "[INFO] HTTP_PROXY: ${HTTP_PROXY:-unset}"

echo "[1/5] Checking FireCrawl..."
if [[ -d "${FIRECRAWL_DIR}" ]]; then
    if is_port_listening "${FIRECRAWL_PORT}"; then
        echo "[INFO] FireCrawl is already listening on port ${FIRECRAWL_PORT}"
    else
        echo "[INFO] Starting FireCrawl with docker compose..."
        (
            cd "${FIRECRAWL_DIR}"
            docker compose up -d
        )
        STARTED_FIRECRAWL=1
    fi
else
    echo "[WARN] FireCrawl directory not found: ${FIRECRAWL_DIR}"
fi

wait_for_port "${FIRECRAWL_PORT}" "FireCrawl" 60 || true

# Release ComfyUI resources before starting heavy ACE-Step models
release_comfyui_resources

echo "[2/5] Checking VRAM Availability..."
# Use the new vram_utils to ensure we have enough space for DiT models
if ! python3 "${SCRIPT_DIR}/server/core/vram_utils.py" 40000; then
    echo "[ERROR] Insufficient VRAM to start ACE-Step models safely." >&2
    echo "[HINT] Try stopping ComfyUI or other GPU processes." >&2
    exit 1
fi

echo "[3/5] Starting ACE-Step..."

start_component "ACESTEP" "${LOG_DIR}/acestep.log" bash "${SCRIPT_DIR}/run_acestep.sh"
sleep 2

echo "[4/5] Starting backend..."
start_component "BACKEND" "${LOG_DIR}/backend.log" bash "${SCRIPT_DIR}/run_backend.sh"
sleep 2

echo "[5/5] Starting frontend..."
start_component "FRONTEND" "${LOG_DIR}/frontend.log" bash "${SCRIPT_DIR}/run_frontend.sh"

echo "[FINISH] Waiting for services to become healthy..."
wait_for_port "${ACESTEP_PORT}" "ACE-Step API" 180 || true
wait_for_port "${BACKEND_PORT}" "Backend API" 60 || true
wait_for_port "${FRONTEND_PORT}" "Frontend" 60 || true

cat <<EOF

Music app stack is running.

- Frontend:  http://localhost:${FRONTEND_PORT}
- Backend:   http://127.0.0.1:${BACKEND_PORT}
- ACE-Step:  http://127.0.0.1:${ACESTEP_PORT}
- FireCrawl: http://127.0.0.1:${FIRECRAWL_PORT}

Logs:
- ${LOG_DIR}/frontend.log
- ${LOG_DIR}/backend.log
- ${LOG_DIR}/acestep.log

Press Ctrl+C to stop the stack.
EOF

wait
