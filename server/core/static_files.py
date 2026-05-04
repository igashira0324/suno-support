from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from core.config import settings

def setup_static_files(app: FastAPI):
    app.mount("/outputs/minimax", StaticFiles(directory=str(settings.minimax_output_dir)), name="minimax_outputs")
    app.mount("/outputs", StaticFiles(directory=str(settings.output_dir)), name="outputs")
    app.mount("/uploads", StaticFiles(directory=str(settings.upload_dir)), name="uploads")
