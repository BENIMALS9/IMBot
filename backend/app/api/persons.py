from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.person import Person, ImagePerson
from app.models.image import Image
from app.schemas import PaginatedResponse

router = APIRouter()


@router.get("")
async def list_persons(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Person).where(Person.user_id == user.id, Person.is_hidden == False).order_by(Person.image_count.desc())
    )
    persons = result.scalars().all()
    return [{
        "id": str(p.id), "name": p.name or "未命名", "slug": p.slug,
        "face_thumbnail": p.face_thumbnail, "image_count": p.image_count,
        "is_verified": p.is_verified,
    } for p in persons]


@router.get("/unknown")
async def list_unknown(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Person).where(Person.user_id == user.id, Person.is_verified == False, Person.is_hidden == False)
    )
    persons = result.scalars().all()
    return [{"id": str(p.id), "name": p.name, "face_thumbnail": p.face_thumbnail, "image_count": p.image_count} for p in persons]


@router.delete("/{person_id}")
async def delete_person(
    person_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a person and all their image associations."""
    person = await db.get(Person, person_id)
    if not person or person.user_id != user.id:
        raise HTTPException(status_code=404, detail="Person not found")

    # Remove all image-person associations for this person
    result = await db.execute(
        select(ImagePerson).where(ImagePerson.person_id == person.id)
    )
    for ip in result.scalars():
        await db.delete(ip)

    await db.delete(person)
    await db.commit()
    return {"message": "deleted"}


@router.put("/{person_id}")
async def update_person(
    person_id: str,
    name: str | None = None,
    is_hidden: bool | None = None,
    merge_from_id: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    person = await db.get(Person, person_id)
    if not person or person.user_id != user.id:
        raise HTTPException(status_code=404, detail="Person not found")

    if name is not None:
        person.name = name
        person.is_verified = True
    if is_hidden is not None:
        person.is_hidden = is_hidden
    if merge_from_id is not None:
        merge_from = await db.get(Person, merge_from_id)
        if merge_from and merge_from.user_id == user.id:
            # Move all image associations
            result = await db.execute(
                select(ImagePerson).where(ImagePerson.person_id == merge_from.id)
            )
            for ip in result.scalars():
                ip.person_id = person.id
            person.image_count += merge_from.image_count
            await db.delete(merge_from)

    await db.commit()
    return {"message": "updated"}


@router.get("/{person_id}/images")
async def get_person_images(
    person_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    person = await db.get(Person, person_id)
    if not person or person.user_id != user.id:
        raise HTTPException(status_code=404, detail="Person not found")

    total = await db.scalar(
        select(func.count(ImagePerson.id)).where(ImagePerson.person_id == person.id)
    ) or 0

    result = await db.execute(
        select(Image, ImagePerson).join(ImagePerson, ImagePerson.image_id == Image.id)
        .where(ImagePerson.person_id == person.id, Image.user_id == user.id)
        .order_by(ImagePerson.created_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )
    rows = result.all()
    images = []
    for img, ip in rows:
        images.append({
            "id": str(img.id), "filename": img.filename, "original_name": img.original_name,
            "thumbnail_path": img.thumbnail_path, "width": img.width, "height": img.height,
            "date_taken": img.date_taken.isoformat() if img.date_taken else None,
            "caption_ai": img.caption_ai,
            "face_bbox": ip.face_bbox, "confidence": ip.confidence,
        })

    return {
        "person": {
            "id": str(person.id), "name": person.name or "未命名",
            "image_count": person.image_count, "is_verified": person.is_verified,
        },
        "images": images, "total": total, "page": page, "page_size": page_size,
    }


@router.get("/{person_id}/face-thumbnail")
async def get_face_thumbnail(
    person_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import os as _os
    from fastapi.responses import FileResponse

    person = await db.get(Person, person_id)
    if not person or person.user_id != user.id:
        raise HTTPException(status_code=404, detail="Person not found")

    if person.face_thumbnail and _os.path.exists(person.face_thumbnail):
        return FileResponse(person.face_thumbnail)

    result = await db.execute(
        select(Image).join(ImagePerson).where(
            ImagePerson.person_id == person.id,
            Image.user_id == user.id,
        ).limit(1)
    )
    img = result.scalar_one_or_none()
    if img and img.thumbnail_path and _os.path.exists(img.thumbnail_path):
        return FileResponse(img.thumbnail_path)

    raise HTTPException(status_code=404, detail="No thumbnail available")
