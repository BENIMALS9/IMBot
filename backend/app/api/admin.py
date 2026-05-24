from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import get_settings
from app.core.security import get_current_user
from app.models.user import User
from app.api.categories import _seed_categories

router = APIRouter()


@router.get("/status")
async def system_status(user: User = Depends(get_current_user)):
    settings = get_settings()
    return {
        "vlm_provider": settings.vlm_provider,
        "enable_classification": settings.enable_classification,
        "enable_object_detection": settings.enable_object_detection,
        "enable_face_recognition": settings.enable_face_recognition,
        "enable_vlm_caption": settings.enable_vlm_caption,
        "clip_model": settings.clip_model,
    }


@router.post("/seed-categories")
async def seed_categories(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _seed_categories(user.id, db)
    await db.commit()
    return {"message": "categories seeded"}
