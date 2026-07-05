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
    payload = {
        "prompt": prompt,
        "lyrics": lyrics,
        "thinking": kwargs.get("thinking", False),
        "inference_steps": kwargs.get("inference_steps", 8),
        "batch_size": kwargs.get("batch_size", 1),
        "audio_duration": kwargs.get("audio_duration", -1),
        "vocal_language": kwargs.get("vocal_language", "en"),
        "model": kwargs.get("model", "acestep-v15-turbo"),
        "seed": kwargs.get("seed", -1),
        "task_type": kwargs.get("task_type", "text2music"),
        "shift": kwargs.get("shift", 1.0),
        "infer_method": kwargs.get("infer_method", "ode"),
        "guidance_scale": kwargs.get("guidance_scale", 7.0),
    }
    
    # Optional musical metadata locks (injected into the LM plan via constrained decoding)
    if kwargs.get("bpm"):
        try:
            payload["bpm"] = int(round(float(kwargs["bpm"])))
        except (TypeError, ValueError):
            pass
    if kwargs.get("key_scale"):
        payload["key_scale"] = str(kwargs["key_scale"])

    # Handle optional sampling mode
    if kwargs.get("sample_mode"):
        payload["sample_mode"] = True
        payload["sample_query"] = kwargs.get("sample_query", prompt)

    # Remove duration if Auto (-1 or 0)
    if payload.get("audio_duration", -1) <= 0:
        del payload["audio_duration"]

    # Handle Cover mode parameters
    if kwargs.get("task_type") == "cover":
        src_audio = kwargs.get("src_audio_path")
        if src_audio:
            payload["src_audio_path"] = src_audio
        payload["audio_cover_strength"] = kwargs.get("audio_cover_strength", 0.8)
        
        # Audio Directed Generation (ADG)
        if kwargs.get("use_adg"):
            payload["use_adg"] = True
            ref_audio = kwargs.get("reference_audio_path")
            if ref_audio:
                payload["reference_audio_path"] = ref_audio

    # Handle Lego mode parameters
    if kwargs.get("task_type") == "lego":
        src_audio = kwargs.get("src_audio_path")
        if src_audio:
            payload["src_audio_path"] = src_audio
        track_name = kwargs.get("track_name", "vocals")
        payload["instruction"] = f"Generate the {track_name.upper()} track based on the audio context:"
        payload["repainting_start"] = kwargs.get("repainting_start", 0.0)
        payload["repainting_end"] = kwargs.get("repainting_end", -1)
        payload["audio_cover_strength"] = kwargs.get("audio_cover_strength", 0.5)
        payload["instrumental"] = False
        # thinking=True: 5Hz LM plans the mix and its codes steer generation (creative, but the
        # DiT then covers the LM plan instead of listening to the source audio).
        # thinking=False: DiT conditions directly on the source audio (official lego behavior;
        # generated track stays aligned with the source in rhythm and harmony).
        payload["thinking"] = bool(kwargs.get("thinking", True))

    # Handle Complete mode parameters (base model only): add coordinated accompaniment
    # to a single input track (e.g. vocals -> full song).
    if kwargs.get("task_type") == "complete":
        src_audio = kwargs.get("src_audio_path")
        if src_audio:
            payload["src_audio_path"] = src_audio
        track_classes = kwargs.get("complete_track_classes")
        if track_classes:
            classes_str = " | ".join(t.upper() for t in track_classes)
            payload["instruction"] = f"Complete the input track with {classes_str}:"
        else:
            payload["instruction"] = "Complete the input track:"
        # DiT-direct: the model must hear the source to build coordinated accompaniment
        # (thinking=True would make it cover the LM's blind plan instead).
        payload["thinking"] = bool(kwargs.get("thinking", False))
        payload["audio_cover_strength"] = kwargs.get("audio_cover_strength", 0.8)

    # Log a truncated version for cleanliness
    log_payload = payload.copy()
    if len(log_payload.get("lyrics", "")) > 100:
        log_payload["lyrics"] = log_payload["lyrics"][:100] + "..."
    if len(log_payload.get("prompt", "")) > 100:
        log_payload["prompt"] = log_payload["prompt"][:100] + "..."
    
    logger.info(f"Releasing task to ACE-Step: {json.dumps(log_payload, indent=2)}")

    # Handle Repaint mode parameters
    if kwargs.get("task_type") == "repaint":
        src_audio = kwargs.get("src_audio_path")
        if src_audio:
            payload["src_audio_path"] = src_audio
        payload["repainting_start"] = kwargs.get("repainting_start", 0.0)
        payload["repainting_end"] = kwargs.get("repainting_end", -1)
        payload["audio_cover_strength"] = kwargs.get("audio_cover_strength", 0.8)
        
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
        
        logger.info(f"ACE-Step query_result status_code={response.status_code}, body={response.text[:2000]}")
        
        # Handle 404 (Task not found yet) as Processing (Status 0)
        if response.status_code == 404:
            return {"status": 0, "error": None}
            
        response.raise_for_status()
        data = response.json()
        if data.get("code") == 200 and data.get("data") and len(data["data"]) > 0:
            task_info = data["data"][0]
            # Result field is a JSON string (parse for any status: running tasks carry
            # progress/stage nested inside result[0])
            res_val = task_info.get("result")
            if res_val and isinstance(res_val, str):
                try:
                    task_info["result"] = json.loads(res_val)
                except Exception as e:
                    if task_info.get("status") == 1:
                        logger.error(f"Failed to parse result JSON string: {e}")
            # Surface nested progress/stage (present while the job is running)
            parsed = task_info.get("result")
            if isinstance(parsed, list) and parsed and isinstance(parsed[0], dict):
                if task_info.get("progress") is None and "progress" in parsed[0]:
                    task_info["progress"] = parsed[0].get("progress")
                if task_info.get("stage") is None and "stage" in parsed[0]:
                    task_info["stage"] = parsed[0].get("stage")
            return task_info
        return {"status": 2, "error": f"Invalid API response: {data.get('code')}"}
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
