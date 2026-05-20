"""
Suno Architect — FastAPI Application Factory.

This is the entry point. All endpoint logic lives in the routes/ package.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from core.config import (
    tasks, logger,
    UPLOAD_DIR, OUTPUT_DIR, MINIMAX_OUTPUT_DIR,
)

# -- Import routers --
from routes.separation import router as separation_router
from routes.voice_conversion import router as voice_conversion_router
from routes.analysis import router as analysis_router
from routes.acestep import router as acestep_router
from routes.audio_tools import router as audio_tools_router
from routes.yue import router as yue_router

# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(title="Suno Architect API", version="4.7")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static file mounts
app.mount("/outputs/minimax", StaticFiles(directory=MINIMAX_OUTPUT_DIR), name="minimax_outputs")
app.mount("/outputs", StaticFiles(directory=OUTPUT_DIR), name="outputs")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# ---------------------------------------------------------------------------
# Register routers
# ---------------------------------------------------------------------------

app.include_router(separation_router)
app.include_router(voice_conversion_router)
app.include_router(analysis_router)
app.include_router(acestep_router)      # prefix="/acestep" defined in router
app.include_router(audio_tools_router)
app.include_router(yue_router)           # prefix="/yue" defined in router

# ---------------------------------------------------------------------------
# Task management (shared across all routers)
# ---------------------------------------------------------------------------

@app.get("/task/{task_id}")
async def get_task_status(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    status = tasks[task_id].get("status")
    progress = tasks[task_id].get("progress")
    logger.info(f"API Request for {task_id}: status={status}, progress={progress}")
    
    return tasks[task_id]

@app.post("/task/{task_id}/cancel")
async def cancel_task(task_id: str):
    if task_id in tasks:
        tasks[task_id]["status"] = "cancelled"
        return {"message": "Cancellation requested"}
    raise HTTPException(status_code=404, detail="Task not found")

# ---------------------------------------------------------------------------
# Dev entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8100, reload=True)
