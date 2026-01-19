import os
import subprocess
import threading
import uuid
import json
import logging
import time
import glob
from huggingface_hub import snapshot_download

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
YUE_DIR = os.path.join(BASE_DIR, "yue")
VENV_SCRIPTS = os.path.join(YUE_DIR, "venv", "Scripts")
VENV_PYTHON = os.path.join(VENV_SCRIPTS, "python.exe")
INFER_SCRIPT = os.path.join(YUE_DIR, "src", "yue", "infer.py")
OUTPUT_DIR = os.path.join(os.path.dirname(BASE_DIR), "outputs", "yue_generations")

# Ensure output directory exists
os.makedirs(OUTPUT_DIR, exist_ok=True)

# In-memory job store (replace with database if needed)
jobs = {}

def start_generation_job(genre_txt: str, lyrics_txt: str, options: dict = None):
    """
    Starts a background thread for YuE music generation.
    """
    if options is None:
        options = {}
        
    job_id = str(uuid.uuid4())
    job_dir = os.path.join(OUTPUT_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)
    
    # Process vocal style - avoid adding duplicates
    vocal_type = options.get("vocal_type", "female")
    genre_txt_lower = genre_txt.lower()
    if vocal_type == "none":
        if "instrumental" not in genre_txt_lower:
            genre_txt = "instrumental, " + genre_txt
    elif vocal_type == "male":
        if "male vocals" not in genre_txt_lower:
            genre_txt = "male vocals, " + genre_txt
    elif vocal_type == "female":
        if "female vocals" not in genre_txt_lower:
            genre_txt = "female vocals, " + genre_txt

    # Save prompts to files (required by CLI)
    genre_file = os.path.join(job_dir, "genre.txt")
    lyrics_file = os.path.join(job_dir, "lyrics.txt")
    
    with open(genre_file, "w", encoding="utf-8") as f:
        f.write(genre_txt)
        
    with open(lyrics_file, "w", encoding="utf-8") as f:
        f.write(lyrics_txt)
        
    jobs[job_id] = {
        "id": job_id,
        "status": "pending",
        "progress": 0,
        "logs": [],
        "output_files": [],
        "created_at": time.time(),
        "error": None
    }
    
    # Start background processing
    thread = threading.Thread(
        target=_run_yue_process, 
        args=(job_id, job_dir, genre_file, lyrics_file, options),
        daemon=True
    )
    thread.start()
    
    return job_id

def get_job_status(job_id: str):
    """
    Returns the current status of a job.
    """
    if job_id not in jobs:
        return None
        
    # Check for output files if job is done (or even if running)
    job = jobs[job_id]
    job_dir = os.path.join(OUTPUT_DIR, job_id)
    
    # Update output files list
    if os.path.exists(job_dir):
        files = glob.glob(os.path.join(job_dir, "*.mp3")) + glob.glob(os.path.join(job_dir, "*.wav"))
        job["output_files"] = [os.path.basename(f) for f in files]
        
    return job

def _run_yue_process(job_id, job_dir, genre_file, lyrics_file, options):
    """
    Executes the YuE inference script in a subprocess.
    """
    job = jobs[job_id]
    job["status"] = "processing"
    
    try:
        # Prepare environment
        # Important: Prepend venv scripts to PATH so that os.system() inside infer.py uses the correct python
        env = os.environ.copy()
        env["PATH"] = VENV_SCRIPTS + os.pathsep + env["PATH"]
        env["VIRTUAL_ENV"] = os.path.join(YUE_DIR, "venv")
        
        # Prepare arguments
        quality = options.get("quality", "fast")
        language = options.get("language", "en")
        
        # Mapping to quantized branches/models
        if language == "ja":
            repo_id = "bartowski/YuE-s1-7B-anneal-jp-kr-cot-exl2"
            if quality == "best":
                revision = "8.0bpw-h8"
            elif quality == "balanced":
                revision = "6.0bpw-h6"
            else:
                revision = "4.25bpw-h6"
        else:
            repo_id = "Doctor-Shotgun/YuE-s1-7B-anneal-en-cot-exl2"
            if quality == "best":
                revision = "8.0bpw-h8"
            elif quality == "balanced":
                revision = "6.0bpw-h6"
            else:
                revision = "4.25bpw-h6"

        # Download/Cache Stage 1 Model
        job["logs"].append(f"Using {language.upper()} focus model: {repo_id} ({revision})")
        job["logs"].append(f"Downloading Stage 1 model ({revision})... This may take several minutes on first run.")
        job["progress"] = 2
        logger.info(f"Ensuring Stage 1 model {repo_id} (rev: {revision}) is available...")
        stage1_model_path = snapshot_download(repo_id=repo_id, revision=revision)
        job["logs"].append(f"Stage 1 model ready: {stage1_model_path}")
        job["progress"] = 5
        
        # Download/Cache Stage 2 Model (only one quality used for now)
        stage2_repo_id = options.get("stage2_model", "Doctor-Shotgun/YuE-s2-1B-general-exl2")
        stage2_revision = "8.0bpw-h8"
        job["logs"].append(f"Downloading Stage 2 model ({stage2_revision})...")
        logger.info(f"Ensuring Stage 2 model {stage2_repo_id} (rev: {stage2_revision}) is available...")
        stage2_model_path = snapshot_download(repo_id=stage2_repo_id, revision=stage2_revision)
        job["logs"].append(f"Stage 2 model ready: {stage2_model_path}")
        job["progress"] = 8
        
        segments = options.get("segments", 2)
        max_new_tokens = options.get("max_new_tokens", 3000)
        
        cmd = [
            VENV_PYTHON,
            INFER_SCRIPT,
            "--stage1_use_exl2",
            "--stage1_model", stage1_model_path,
            "--stage1_cache_mode", "Q4", 
            "--stage2_use_exl2",
            "--stage2_model", stage2_model_path,
            "--stage2_cache_mode", "Q4",
            "--stage2_cache_size", "16384", 
            "--genre_txt", genre_file,
            "--lyrics_txt", lyrics_file,
            "--output_dir", job_dir,
            "--run_n_segments", str(segments),
            "--max_new_tokens", str(max_new_tokens),
            "--repetition_penalty", "1.1",
            "--cuda_idx", "0"
        ]
        
        # Log command
        logger.info(f"Starting YuE job {job_id} with command: {' '.join(cmd)}")
        job["logs"].append(f"Command: {' '.join(cmd)}")
        
        # Execute
        process = subprocess.Popen(
            cmd,
            cwd=YUE_DIR, 
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env=env,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
        
        # Stream logs
        for line in process.stdout:
            line = line.strip()
            if line:
                logger.info(f"[YuE {job_id}] {line}")
                job["logs"].append(line)
                
                # Improved Progress parsing
                import re
                token_match = re.search(r'(\d+)/(\d+)\s*\[', line)
                if token_match:
                    current = int(token_match.group(1))
                    total = int(token_match.group(2))
                    
                    if "50%|##### | 1/2" in line or "100%|##########| 2/2" in line or "/2 [" in line:
                         seg_match = re.search(r'(\d+)/(\d+)', line)
                         if seg_match:
                             c_seg = int(seg_match.group(1))
                             t_seg = int(seg_match.group(2))
                             progress = 50 + int((c_seg / t_seg) * 40)
                             job["progress"] = min(progress, 90)
                    else:
                        progress = 10 + int((current / total) * 40)
                        job["progress"] = min(progress, 50)
                elif "Starting stage 1" in line:
                    job["progress"] = 10
                elif "Starting stage 2" in line:
                    job["progress"] = 50
                elif "postprocessing" in line.lower() or "vocoder" in line.lower():
                    job["progress"] = 90
        
        process.wait()
        
        if process.returncode == 0:
            job["status"] = "completed"
            job["progress"] = 100
            
            # Rename files with title
            title = options.get("title", "My Song").replace(" ", "_")
            title = "".join([c for c in title if c.isalnum() or c in ('-', '_')]).rstrip()
            
            job_dir_files = glob.glob(os.path.join(job_dir, "*.mp3")) + glob.glob(os.path.join(job_dir, "*.wav"))
            for fpath in job_dir_files:
                fname = os.path.basename(fpath)
                if not fname.startswith(title):
                    new_name = f"{title}_{fname}"
                    new_path = os.path.join(job_dir, new_name)
                    try:
                        os.rename(fpath, new_path)
                        logger.info(f"Renamed {fname} to {new_name}")
                    except Exception as e:
                        logger.warning(f"Failed to rename {fname}: {e}")

            job["logs"].append("Generation completed successfully.")
        else:
            job["status"] = "failed"
            job["error"] = f"Process exited with code {process.returncode}"
            job["logs"].append(f"FAILED: Process exited with code {process.returncode}")
            
    except Exception as e:
        logger.error(f"Error in YuE job {job_id}: {str(e)}")
        job["status"] = "failed"
        job["error"] = str(e)
        job["logs"].append(f"EXCEPTION: {str(e)}")
