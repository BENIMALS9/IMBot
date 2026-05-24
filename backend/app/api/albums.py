from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.album import Album, AlbumImage
from app.models.image import Image

router = APIRouter()


class AddImagesRequest(BaseModel):
    image_ids: list[str]


@router.get("")
async def list_albums(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Count images per album
    result = await db.execute(
        select(Album).where(Album.user_id == user.id).order_by(Album.updated_at.desc())
    )
    albums = result.scalars().all()

    out = []
    for a in albums:
        count = await db.scalar(
            select(func.count(AlbumImage.id)).where(AlbumImage.album_id == a.id)
        )
        out.append({
            "id": str(a.id), "name": a.name, "description": a.description,
            "is_smart": a.is_smart, "image_count": count or 0,
        })
    return out


@router.get("/{album_id}")
async def get_album(
    album_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    album = await db.get(Album, album_id)
    if not album or album.user_id != user.id:
        raise HTTPException(status_code=404, detail="Album not found")

    # Count
    total = await db.scalar(
        select(func.count(AlbumImage.id)).where(AlbumImage.album_id == album.id)
    ) or 0

    # Images in album
    result = await db.execute(
        select(Image, AlbumImage).join(AlbumImage, AlbumImage.image_id == Image.id)
        .where(AlbumImage.album_id == album.id)
        .order_by(AlbumImage.added_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )
    rows = result.all()
    images = []
    for img, ai in rows:
        images.append({
            "id": str(img.id), "filename": img.filename, "original_name": img.original_name,
            "thumbnail_path": img.thumbnail_path, "width": img.width, "height": img.height,
            "date_taken": img.date_taken.isoformat() if img.date_taken else None,
            "caption_ai": img.caption_ai, "added_at": ai.added_at.isoformat() if ai.added_at else None,
        })

    return {
        "album": {
            "id": str(album.id), "name": album.name, "description": album.description,
            "is_smart": album.is_smart,
        },
        "images": images, "total": total, "page": page, "page_size": page_size,
    }


@router.post("")
async def create_album(
    name: str,
    description: str | None = None,
    is_smart: bool = False,
    smart_rules: dict | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    album = Album(user_id=user.id, name=name, description=description, is_smart=is_smart, smart_rules=smart_rules)
    db.add(album)
    await db.commit()
    await db.refresh(album)
    return {"id": str(album.id), "name": album.name}


@router.delete("/{album_id}")
async def delete_album(
    album_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    album = await db.get(Album, album_id)
    if not album or album.user_id != user.id:
        raise HTTPException(status_code=404, detail="Album not found")
    await db.delete(album)
    await db.commit()
    return {"message": "deleted"}


@router.put("/{album_id}")
async def update_album(
    album_id: str,
    name: str | None = None,
    description: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    album = await db.get(Album, album_id)
    if not album or album.user_id != user.id:
        raise HTTPException(status_code=404, detail="Album not found")
    if name is not None:
        album.name = name
    if description is not None:
        album.description = description
    await db.commit()
    return {"id": str(album.id), "name": album.name, "description": album.description}


@router.post("/{album_id}/images")
async def add_images_to_album(
    album_id: str,
    req: AddImagesRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    album = await db.get(Album, album_id)
    if not album or album.user_id != user.id:
        raise HTTPException(status_code=404, detail="Album not found")
    for image_id in req.image_ids:
        db.add(AlbumImage(album_id=album.id, image_id=image_id))
    await db.commit()
    return {"message": f"added {len(req.image_ids)} images"}


@router.delete("/{album_id}/images/{image_id}")
async def remove_image_from_album(
    album_id: str,
    image_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AlbumImage).where(
            AlbumImage.album_id == album_id,
            AlbumImage.image_id == image_id,
        )
    )
    ai = result.scalar_one_or_none()
    if ai:
        await db.delete(ai)
        await db.commit()
    return {"message": "removed"}
