import requests
import json
import time
import logging

logger = logging.getLogger("SunoArchitect.AceStep")

ACESTEP_API_URL = "http://127.0.0.1:8101"

def release_task(prompt, lyrics, **kwargs):
    """
    Release a music generation task to ACE-Step API.
    """
    url = f"{ACESTEP_API_URL}/release_task"
    task_type = kwargs.get("task_type", "text2music")
    model_name = str(kwargs.get("model", "")).lower()
    is_turbo_model = "turbo" in model_name
    cover_repaint_use_lm = bool(kwargs.get("cover_repaint_use_lm", True))

    payload = {
        "prompt": prompt,
        "lyrics": lyrics,
        "thinking": kwargs.get("thinking", False),
        "inference_steps": kwargs.get("inference_steps", 8),
        "batch_size": kwargs.get("batch_size", 1),
        "audio_duration": kwargs.get("audio_duration", -1),
        "vocal_language": kwargs.get("vocal_language", "en"),
        "model": kwargs.get("model", "acestep-v15-xl-sft"),
        "seed": kwargs.get("seed", -1),
        "task_type": task_type,
        "shift": kwargs.get("shift", 1.0),
        "infer_method": kwargs.get("infer_method", "ode"),
        "guidance_scale": kwargs.get("guidance_scale", 7.0),
    }

    # Cover-only LM/CoT toggle for A/B tests.
    # (OpenRouter has separate no_lm_task logic, but this path does not use it.)
    if task_type == "cover" and cover_repaint_use_lm:
        payload["thinking"] = bool(kwargs.get("thinking", True)) and (not is_turbo_model)
        payload["use_cot_metas"] = True
        payload["use_cot_caption"] = True
        payload["use_cot_language"] = True
        payload["use_format"] = bool(kwargs.get("use_format", False))
    
    # Handle optional sampling mode
    if kwargs.get("sample_mode"):
        payload["sample_mode"] = True
        payload["sample_query"] = kwargs.get("sample_query", prompt)

    # Handle Cover mode parameters
    if task_type == "cover":
        src_audio = kwargs.get("src_audio_path")
        if src_audio:
            payload["src_audio_path"] = src_audio
        payload["audio_cover_strength"] = kwargs.get("audio_cover_strength", 0.9)
        
        # Audio Directed Generation (ADG)
        if kwargs.get("use_adg"):
            payload["use_adg"] = True
            ref_audio = kwargs.get("reference_audio_path")
            if ref_audio:
                payload["reference_audio_path"] = ref_audio

    # Handle Lego mode parameters
    # Lego requires:
    # 1. track_name baked into instruction (API does not accept track_name separately)
    # 2. repainting_start/end to mark region for new track generation
    # 3. instrumental=False to ensure vocals are generated (not silenced)
    # 4. audio_cover_strength controls BGM vs new track mix
    if task_type == "lego":
        src_audio = kwargs.get("src_audio_path")
        if src_audio:
            payload["src_audio_path"] = src_audio
        track_name = kwargs.get("track_name", "vocals")
        # Build instruction with track_name resolved (ACE-Step API doesn't accept track_name separately)
        # TASK_INSTRUCTIONS["lego"] = "Generate the {TRACK_NAME} track based on the audio context:"
        # We must resolve {TRACK_NAME} here before sending, otherwise the placeholder is passed as-is to DiT!
        payload["instruction"] = f"Generate the {track_name.upper()} track based on the audio context:"
        # Repaint full range to generate new track (vocals) over entire duration
        payload["repainting_start"] = kwargs.get("repainting_start", 0.0)
        payload["repainting_end"] = kwargs.get("repainting_end", -1)
        # audio_cover_strength: 0.5 is balanced (BGM preserved + new vocals added)
        # 1.0 = exact reproduction (no new content), 0.0 = completely free generation
        payload["audio_cover_strength"] = kwargs.get("audio_cover_strength", 0.5)
        # CRITICAL: instrumental must be False to ensure vocals are generated!
        # If instrumental=True or lyrics has [inst], ACE-Step silences the vocal output.
        payload["instrumental"] = False
        # Enable Thinking mode for Lego tasks so that it properly aligns logic with the track context
        payload["thinking"] = True

    logger.info("Releasing task with payload:")
    logger.debug(json.dumps(payload, indent=2))

    # Handle Repaint mode parameters
    if task_type == "repaint":
        src_audio = kwargs.get("src_audio_path")
        if src_audio:
            payload["src_audio_path"] = src_audio
        payload["repainting_start"] = kwargs.get("repainting_start", 0.0)
        payload["repainting_end"] = kwargs.get("repainting_end", -1)
        payload["audio_cover_strength"] = kwargs.get("audio_cover_strength", 0.9)
        
        # Audio Directed Generation (ADG) for repaint
        if kwargs.get("use_adg"):
            payload["use_adg"] = True
            ref_audio = kwargs.get("reference_audio_path")
            if ref_audio:
                payload["reference_audio_path"] = ref_audio

    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.ConnectionError:
        error_msg = "ACE-Step API Server (Port 8101) is currently starting up. Please wait 1-2 minutes for the model to load, then try again. / ACE-Step サーバーが起動中です。モデルのロードに1〜2分かかりますので、少々お待ちください。"
        logger.warning(error_msg)
        return {"code": 503, "error": error_msg}
    except Exception as e:
        logger.error(f"Failed to release task: {e}")
        return {"code": 500, "error": str(e)}

def query_result(task_id):
    """
    Query the result of a task.
    """
    url = f"{ACESTEP_API_URL}/query_result"
    payload = {"task_id_list": [task_id]}
    
    try:
        response = requests.post(url, json=payload)
        
        # Handle 404 (Task not found yet) as Processing (Status 0)
        # This prevents "Error: Not Found" from flashing in the UI while proper task propagation happens
        if response.status_code == 404:
            return {"status": 0, "error": None}
            
        response.raise_for_status()
        data = response.json()
        if data.get("code") == 200 and data.get("data"):
            task_info = data["data"][0]
            # Result field is a JSON string
            if task_info.get("status") == 1 and task_info.get("result"):
                task_info["result"] = json.loads(task_info["result"])
            return task_info
        return {"status": 2, "error": "Invalid API response"}
    except requests.exceptions.ConnectionError:
        return {"status": 2, "error": "Connection failed: ACE-Step API Server (8101) is unreachable."}
    except Exception as e:
        logger.error(f"Failed to query result: {e}")
        return {"status": 2, "error": str(e)}

def get_audio_url(path):
    """
    Get the web URL for an audio file.
    """
    return f"{ACESTEP_API_URL}/v1/audio?path={path}"
