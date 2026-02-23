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
    }
    
    # Handle optional sampling mode
    if kwargs.get("sample_mode"):
        payload["sample_mode"] = True
        payload["sample_query"] = kwargs.get("sample_query", prompt)

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
        error_msg = "ACE-Step API Server (Port 8101) is not running. Please start the server."
        logger.error(error_msg)
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
