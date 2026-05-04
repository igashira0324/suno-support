import logging
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, File, UploadFile

from core.config import settings
from core.utils import resolve_web_path
from svs_service import SVSService

logger = logging.getLogger("SunoArchitect.SVSRouter")

router = APIRouter(prefix="/svs", tags=["svs"])

# 最小修正として settings.output_dir をそのまま渡す (URL 生成ロジックと一致させるため)
svs_service = SVSService(
    upload_dir=str(settings.upload_dir),
    output_dir=str(settings.output_dir),
)

class SVSGenerateRequest(BaseModel):
    file_url: str
    instrument: str = "other"
    lyrics: str

@router.post("/generate")
async def generate_svs(request: SVSGenerateRequest):
    try:
        # resolve_web_path は /uploads/ や /outputs/ をローカルパスに変換する
        file_path = resolve_web_path(request.file_url)

        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"Audio file not found: {request.file_url}")

        task_id = await svs_service.start_extraction_task(
            file_path=str(file_path),
            instrument=request.instrument,
            lyrics=request.lyrics,
        )

        return {"task_id": task_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"SVS generate failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status/{task_id}")
async def get_svs_status(task_id: str):
    task = svs_service.get_task_status(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task
