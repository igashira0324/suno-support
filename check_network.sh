#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/proxy_common.sh"

if [[ $# -gt 1 ]]; then
    echo "Usage: ./check_network.sh [corporate|wifi|current]" >&2
    exit 1
fi

MODE="${1:-current}"

case "${MODE}" in
    corporate|wifi)
        "${SCRIPT_DIR}/switch_proxy_mode.sh" "${MODE}"
        ;;
    current)
        ;;
    *)
        echo "Usage: ./check_network.sh [corporate|wifi|current]" >&2
        exit 1
        ;;
esac

load_project_proxy_env "${SCRIPT_DIR}"

echo "Checking network with profile: ${PROXY_PROFILE:-current}"
echo "HTTP_PROXY=${HTTP_PROXY:-unset}"
echo "HTTPS_PROXY=${HTTPS_PROXY:-unset}"
echo "NO_PROXY=${NO_PROXY:-unset}"
echo

FAILED=0

check_url() {
    local label="$1"
    local url="$2"
    local expected="$3"
    local status_code

    if status_code="$(curl -sS -L --max-time 10 -o /dev/null -w '%{http_code}' "${url}")"; then
        if [[ "${status_code}" == "${expected}" ]]; then
            printf '[OK] %-18s %s (HTTP %s)\n' "${label}" "${url}" "${status_code}"
        else
            printf '[NG] %-18s %s (HTTP %s, expected %s)\n' "${label}" "${url}" "${status_code}" "${expected}"
            FAILED=1
        fi
    else
        printf '[NG] %-18s %s (request failed)\n' "${label}" "${url}"
        FAILED=1
    fi
}

check_url "Google" "https://www.google.com/generate_204" "204"
check_url "Gemini API" "https://generativelanguage.googleapis.com/\$discovery/rest?version=v1beta" "200"
check_url "npm registry" "https://registry.npmjs.org/-/ping" "200"
check_url "PyPI" "https://pypi.org/simple/pip/" "200"

if [[ "${FAILED}" -eq 0 ]]; then
    echo
    echo "Network checks passed."
else
    echo
    echo "One or more network checks failed." >&2
    exit 1
fi
