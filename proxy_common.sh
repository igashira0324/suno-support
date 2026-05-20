#!/usr/bin/env bash

clear_proxy_env() {
    unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY all_proxy NO_PROXY no_proxy
}

load_project_proxy_env() {
    local project_dir="$1"
    local state_file="${project_dir}/proxy_profiles/current.env"

    clear_proxy_env

    if [[ -f "${state_file}" ]]; then
        # shellcheck disable=SC1090
        source "${state_file}"
    fi
}
