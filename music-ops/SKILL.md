# ACE-Step Music Operation Skill

This document codifies the "Ironclad" operational protocols for managing the `ace-step-music` project on the DGX SPARK system.

## 1. Port Architecture
The system relies on four primary services:
- **Frontend (HTTPS)**: `3300`
- **FastAPI Backend**: `8100`
- **ACE-Step DiT API**: `8101`
- **FireCrawl (Docker)**: `3002`

## 2. Startup Protocol (The "Golden Path")
Always use `make start` or `./run_local.sh`. The script performs:
1. **Proxy Injection**: Loads corporate/wifi profiles from `share/proxy_common.sh`.
2. **ComfyUI Resource Release**: Sends `/unload_models` and `/free` to port 8188.
3. **VRAM Guard**: Verifies at least **40GB** of free VRAM. If low, it aborts to prevent OOM.
4. **Ordered Startup**: FireCrawl -> ACE-Step -> Backend -> Frontend.

## 3. Resource Management
- **Resident VRAM**: ACE-Step requires ~38GB.
- **Co-existence**: If ComfyUI is running, it MUST be cleared before starting music generation. The harness does this automatically.
- **Graceful Shutdown**: Use `make stop`. This kills PIDs and stops Docker containers to prevent "port already in use" errors.

## 4. Troubleshooting
- **Low VRAM Error**: Run `nvidia-smi` to see what is hogging memory. Usually `python` processes from ComfyUI.
- **False MP3**: If the backend produces WAVs renamed to MP3s, browsers will fail to play. Use `transcode_to_mp3` in `audio_utils.py`.
- **ARM64 Dependencies**: ACE-Step uses `uv`. If dependencies are missing, run `make setup`.
- **HTTPS Warning**: The frontend uses `basicSsl`. Browsers may show a warning; proceed to "Advanced -> Proceed to localhost".

## 5. Maintenance
- **Logs**: Located in `.logs/local/`. Check `acestep.log` first if generation stalls.
- **VRAM Status**: Run `make status` to get a quick health report.
