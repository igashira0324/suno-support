import logging
from fastapi import FastAPI
from core.config import settings
from core.cors import setup_cors
from core.static_files import setup_static_files
from routers import tasks, acestep, files, suno

# Initialize logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SunoArchitect")

app = FastAPI(title="Suno AI Backend", version="1.0.0")

# Setup CORS
setup_cors(app)

# Setup Static Files
setup_static_files(app)

# Include Routers
app.include_router(tasks.router)
app.include_router(acestep.router)
app.include_router(files.router)
app.include_router(suno.router)

@app.get("/")
async def root():
    return {
        "message": "Suno Architect API is active",
        "version": "1.0.0",
        "docs": "/docs"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.backend_port)
