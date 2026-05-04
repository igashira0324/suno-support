from fastapi import APIRouter, HTTPException
from ..core.state import tasks

router = APIRouter(prefix="/task", tags=["tasks"])

@router.get("/{task_id}")
async def get_task_status(task_id: str):
    """Retrieves the status and results of a background task."""
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks[task_id]
@router.post("/{task_id}/cancel")
async def cancel_task(task_id: str):
    """Requests cancellation of a background task."""
    if task_id in tasks:
        tasks[task_id]["status"] = "cancelled"
        return {"message": "Cancellation requested"}
    raise HTTPException(status_code=404, detail="Task not found")
