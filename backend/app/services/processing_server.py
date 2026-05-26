"""Processing Service — standalone FastAPI app for AI image processing.

Runs on its own port (8002), scales independently from main API.
Uses ThreadPoolExecutor (not ProcessPool) because:
- Sync psycopg2 DB has no asyncpg/greenlet threading issues
- ONNX Runtime releases GIL during inference (InsightFace)
- VLM calls are I/O bound (GIL released)
- Simpler than multiprocessing on Windows
"""

from __future__ import annotations

import os
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST, REGISTRY

# Ensure backend is on path when running standalone
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


class ProcessRequest(BaseModel):
    image_id: str
    enable_caption: bool = True
    enable_faces: bool = True


class ProcessResponse(BaseModel):
    status: str
    image_id: str


class StatusResponse(BaseModel):
    image_id: str
    processing_status: str | None
    tasks: list[dict]


app = FastAPI(title="ImageDB Processing Service", version="0.2.0")

# Thread pool for parallel image processing
_MAX_WORKERS = int(os.environ.get("PROCESSING_WORKERS", "2"))
_executor = ThreadPoolExecutor(max_workers=_MAX_WORKERS)
_active_count = 0
_active_lock = threading.Lock()


@app.on_event("shutdown")
def _shutdown():
    _executor.shutdown(wait=True)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/process", response_model=ProcessResponse)
def process_image(req: ProcessRequest):
    """Submit an image for AI processing. Runs in a background thread."""
    global _active_count

    def _worker():
        global _active_count
        with _active_lock:
            _active_count += 1
        # Now actually starting — mark as processing
        from app.services.processing_pipeline import _update_image_status_sync
        _update_image_status_sync(req.image_id, "processing")
        try:
            from app.services.processing_pipeline import process_image_sync
            process_image_sync(req.image_id, req.enable_caption, req.enable_faces)
        except Exception:
            from app.services.processing_pipeline import _update_image_status_sync
            _update_image_status_sync(req.image_id, "error")
        finally:
            with _active_lock:
                _active_count -= 1

    _executor.submit(_worker)
    return ProcessResponse(status="accepted", image_id=req.image_id)


@app.get("/status/{image_id}", response_model=StatusResponse)
def get_status(image_id: str):
    """Get current processing status for an image."""
    from app.core.database import SyncSession
    from app.models.image import Image
    from app.models.processing_task import ProcessingTask
    from sqlalchemy import select

    with SyncSession() as db:
        img = db.get(Image, image_id)
        if not img:
            raise HTTPException(status_code=404, detail="Image not found")

        tasks = db.execute(
            select(ProcessingTask)
            .where(ProcessingTask.image_id == image_id)
            .order_by(ProcessingTask.created_at.desc())
        ).scalars().all()

        return StatusResponse(
            image_id=str(img.id),
            processing_status=img.processing_status,
            tasks=[
                {
                    "task_type": t.task_type,
                    "status": t.status,
                    "error_message": t.error_message,
                    "completed_at": t.completed_at.isoformat() if t.completed_at else None,
                }
                for t in tasks
            ],
        )


@app.get("/health")
def health():
    """Health check with active task count."""
    return {
        "status": "ok",
        "active_tasks": _active_count,
        "max_workers": _MAX_WORKERS,
    }


@app.get("/metrics")
def metrics():
    """Prometheus metrics endpoint."""
    from prometheus_client import generate_latest
    return __import__("fastapi").responses.Response(
        content=generate_latest(REGISTRY),
        media_type=CONTENT_TYPE_LATEST,
    )
