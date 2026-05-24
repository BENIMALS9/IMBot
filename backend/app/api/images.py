import os
import uuid
import hashlib
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from PIL import Image as PILImage
import exifread

from app.core.database import get_db
from app.core.config import get_settings
from app.core.security import get_current_user
from app.models.user import User
from app.models.image import Image
from app.models.folder import Folder
from app.models.category import ImageCategory, Category
from app.models.person import ImagePerson, Person
from app.models.tag import ImageTag, Tag
from app.models.album import Album, AlbumImage
from app.schemas.image import ImageResponse, ImageDetailResponse, ImageUpdateRequest, BatchOperationRequest
from app.schemas import PaginatedResponse

router = APIRouter()
settings = get_settings()


def _extract_exif(filepath: str) -> dict:
    """Extract EXIF data from image file."""
    result = {
        "date_taken": None, "camera_model": None, "lens_model": None,
        "focal_length": None, "aperture": None, "shutter_speed": None,
        "iso": None, "gps_latitude": None, "gps_longitude": None,
        "gps_altitude": None, "exif_raw": None,
    }
    try:
        with open(filepath, "rb") as f:
            tags = exifread.process_file(f, details=False)
            result["exif_raw"] = {k: str(v) for k, v in tags.items()}

            if "EXIF DateTimeOriginal" in tags:
                dt_str = str(tags["EXIF DateTimeOriginal"])
                try:
                    result["date_taken"] = datetime.strptime(dt_str, "%Y:%m:%d %H:%M:%S")
                except ValueError:
                    pass
            if "Image Model" in tags:
                result["camera_model"] = str(tags["Image Model"])
            if "EXIF LensModel" in tags:
                result["lens_model"] = str(tags["EXIF LensModel"])
            if "EXIF FocalLength" in tags:
                result["focal_length"] = str(tags["EXIF FocalLength"])
            if "EXIF FNumber" in tags:
                result["aperture"] = str(tags["EXIF FNumber"])
            if "EXIF ExposureTime" in tags:
                result["shutter_speed"] = str(tags["EXIF ExposureTime"])
            if "EXIF ISOSpeedRatings" in tags:
                result["iso"] = int(str(tags["EXIF ISOSpeedRatings"]))

            # GPS extraction
            if "GPS GPSLatitude" in tags and "GPS GPSLatitudeRef" in tags:
                result["gps_latitude"] = _convert_gps(
                    str(tags["GPS GPSLatitude"]), str(tags["GPS GPSLatitudeRef"])
                )
            if "GPS GPSLongitude" in tags and "GPS GPSLongitudeRef" in tags:
                result["gps_longitude"] = _convert_gps(
                    str(tags["GPS GPSLongitude"]), str(tags["GPS GPSLongitudeRef"])
                )
    except Exception:
        pass
    return result


def _convert_gps(coords: str, ref: str) -> float:
    """Convert EXIF GPS coordinates to decimal degrees."""
    parts = [float(x.split("/")[0]) / float(x.split("/")[1]) if "/" in x else float(x)
             for x in coords.strip("[]").split(",")]
    degrees = parts[0] + parts[1] / 60 + parts[2] / 3600
    if ref in ("S", "W"):
        degrees = -degrees
    return degrees


@router.post("/upload")
async def upload_images(
    files: list[UploadFile] = File(...),
    folder_id: str | None = Form(None),
    album_id: str | None = Form(None),
    enable_ai_caption: bool = Form(True),
    enable_face_recognition: bool = Form(True),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload one or more images to a folder."""
    # Validate folder
    if folder_id:
        folder = await db.get(Folder, folder_id)
        if not folder or folder.user_id != user.id:
            raise HTTPException(status_code=404, detail="Folder not found")
    else:
        # Default folder
        result = await db.execute(
            select(Folder).where(Folder.user_id == user.id, Folder.name == "默认文件夹")
        )
        folder = result.scalar_one_or_none()
        if not folder:
            folder = Folder(user_id=user.id, name="默认文件夹")
            db.add(folder)
            await db.flush()

    uploaded = []
    os.makedirs(settings.storage_path, exist_ok=True)
    os.makedirs(settings.thumbnail_path, exist_ok=True)

    for file in files:
        # Save original
        ext = os.path.splitext(file.filename or "image.jpg")[1].lower()
        stored_name = f"{uuid.uuid4().hex}{ext}"
        file_path = os.path.join(settings.storage_path, stored_name)

        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        # Generate thumbnail
        thumb_name = f"thumb_{stored_name}"
        thumb_path = os.path.join(settings.thumbnail_path, thumb_name)
        try:
            from PIL import ImageOps
            img = PILImage.open(file_path)
            img = ImageOps.exif_transpose(img)  # Apply EXIF orientation
            img.thumbnail((400, 400), PILImage.LANCZOS)
            img.save(thumb_path)
        except Exception:
            thumb_path = None

        # Extract EXIF
        exif_data = _extract_exif(file_path)

        # Create image record
        image = Image(
            user_id=user.id,
            folder_id=folder.id,
            filename=stored_name,
            original_name=file.filename,
            file_path=file_path,
            thumbnail_path=thumb_path,
            file_size=len(content),
            width=img.width if img else None,
            height=img.height if img else None,
            mime_type=file.content_type,
            file_hash=hashlib.sha256(content).hexdigest(),
            date_taken=exif_data["date_taken"],
            camera_model=exif_data["camera_model"],
            lens_model=exif_data["lens_model"],
            focal_length=exif_data["focal_length"],
            aperture=exif_data["aperture"],
            shutter_speed=exif_data["shutter_speed"],
            iso=exif_data["iso"],
            gps_latitude=exif_data["gps_latitude"],
            gps_longitude=exif_data["gps_longitude"],
            gps_altitude=exif_data["gps_altitude"],
            exif_raw=exif_data["exif_raw"],
        )
        db.add(image)
        uploaded.append(image)

        # Update folder count
        folder.image_count = (folder.image_count or 0) + 1

    await db.commit()

    # Add to album if specified
    if album_id:
        album = await db.get(Album, album_id)
        if album and album.user_id == user.id:
            for img in uploaded:
                db.add(AlbumImage(album_id=album.id, image_id=img.id))
            await db.commit()

    # Enqueue AI processing
    from app.tasks.processing import process_new_image
    for img in uploaded:
        process_new_image.delay(str(img.id), enable_caption=enable_ai_caption, enable_faces=enable_face_recognition)

    return {"uploaded": len(uploaded), "image_ids": [str(img.id) for img in uploaded]}


@router.get("", response_model=PaginatedResponse)
async def list_images(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    folder_id: str | None = None,
    category_slug: str | None = None,
    person_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    tag_slug: str | None = None,
    sort: str = "date_taken",
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Image).where(Image.user_id == user.id)
    count_query = select(func.count(Image.id)).where(Image.user_id == user.id)

    if folder_id:
        query = query.where(Image.folder_id == folder_id)
        count_query = count_query.where(Image.folder_id == folder_id)
    if category_slug:
        query = query.join(ImageCategory).join(Category).where(Category.slug == category_slug)
        count_query = count_query.join(ImageCategory).join(Category).where(Category.slug == category_slug)
    if person_id:
        query = query.join(ImagePerson).where(ImagePerson.person_id == person_id)
        count_query = count_query.join(ImagePerson).where(ImagePerson.person_id == person_id)
    if date_from:
        query = query.where(Image.date_taken >= date_from)
        count_query = count_query.where(Image.date_taken >= date_from)
    if date_to:
        query = query.where(Image.date_taken <= date_to)
        count_query = count_query.where(Image.date_taken <= date_to)
    if tag_slug:
        query = query.join(ImageTag).join(Tag).where(Tag.slug == tag_slug)
        count_query = count_query.join(ImageTag).join(Tag).where(Tag.slug == tag_slug)

    # Sort
    sort_cols = {
        "date_taken": Image.date_taken.desc().nulls_last(),
        "created_at": Image.created_at.desc(),
        "filename": Image.filename.asc(),
    }
    order = sort_cols.get(sort, Image.date_taken.desc().nulls_last())
    query = query.order_by(order)

    # Pagination
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    images = result.scalars().all()

    return PaginatedResponse(
        items=[ImageResponse.model_validate(img) for img in images],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/recent")
async def recent_uploads(
    limit: int = Query(20, ge=5, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return recently uploaded images with AI processing status."""
    from app.models.processing_task import ProcessingTask

    result = await db.execute(
        select(Image)
        .where(Image.user_id == user.id)
        .order_by(Image.created_at.desc())
        .limit(limit)
    )
    images = result.scalars().all()

    items = []
    for img in images:
        tasks_result = await db.execute(
            select(ProcessingTask)
            .where(ProcessingTask.image_id == img.id)
            .order_by(ProcessingTask.created_at.desc())
        )
        tasks = tasks_result.scalars().all()

        items.append({
            "id": str(img.id),
            "filename": img.filename,
            "original_name": img.original_name,
            "thumbnail_path": img.thumbnail_path,
            "caption_ai": img.caption_ai,
            "processing_status": img.processing_status or "pending",
            "created_at": img.created_at.isoformat() if img.created_at else None,
            "tasks": [
                {
                    "task_type": t.task_type,
                    "status": t.status,
                    "error_message": t.error_message,
                    "completed_at": t.completed_at.isoformat() if t.completed_at else None,
                }
                for t in tasks
            ],
        })
    return items


@router.get("/{image_id}", response_model=ImageDetailResponse)
async def get_image(
    image_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    image = await db.get(Image, image_id)
    if not image or image.user_id != user.id:
        raise HTTPException(status_code=404, detail="Image not found")

    # Load relations
    cat_result = await db.execute(
        select(ImageCategory, Category).join(Category).where(ImageCategory.image_id == image.id)
    )
    categories = [
        {"id": str(cat.id), "name": cat.name, "slug": cat.slug, "confidence": ic.confidence}
        for ic, cat in cat_result
    ]

    person_result = await db.execute(
        select(ImagePerson, Person).join(Person).where(ImagePerson.image_id == image.id)
    )
    persons = [
        {"id": str(p.id), "name": p.name, "confidence": ip.confidence}
        for ip, p in person_result
    ]

    tag_result = await db.execute(
        select(Tag.name).join(ImageTag).where(ImageTag.image_id == image.id)
    )
    tags = [t for (t,) in tag_result]

    return ImageDetailResponse(
        id=str(image.id),
        folder_id=str(image.folder_id),
        filename=image.filename,
        original_name=image.original_name,
        thumbnail_path=image.thumbnail_path,
        file_size=image.file_size,
        width=image.width,
        height=image.height,
        mime_type=image.mime_type,
        date_taken=image.date_taken,
        camera_model=image.camera_model,
        lens_model=image.lens_model,
        focal_length=image.focal_length,
        aperture=image.aperture,
        shutter_speed=image.shutter_speed,
        iso=image.iso,
        gps_latitude=image.gps_latitude,
        gps_longitude=image.gps_longitude,
        gps_altitude=image.gps_altitude,
        location_name=image.location_name,
        exif_raw=image.exif_raw,
        caption_ai=image.caption_ai,
        user_notes=image.user_notes,
        created_at=image.created_at,
        categories=categories,
        persons=persons,
        tags=tags,
    )

@router.put("/{image_id}")
async def update_image(
    image_id: str,
    req: ImageUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    image = await db.get(Image, image_id)
    if not image or image.user_id != user.id:
        raise HTTPException(status_code=404, detail="Image not found")

    if req.user_notes is not None:
        image.user_notes = req.user_notes
    if req.folder_id is not None:
        folder = await db.get(Folder, req.folder_id)
        if not folder or folder.user_id != user.id:
            raise HTTPException(status_code=404, detail="Folder not found")
        image.folder_id = folder.id
    if req.category_ids is not None:
        # Remove existing categories
        existing = await db.execute(
            select(ImageCategory).where(ImageCategory.image_id == image.id)
        )
        for ic in existing.scalars():
            await db.delete(ic)
        # Add new categories (manually assigned, not AI)
        for cid in req.category_ids:
            cat = await db.get(Category, cid)
            if cat and cat.user_id == user.id:
                db.add(ImageCategory(
                    image_id=image.id,
                    category_id=cat.id,
                    confidence=1.0,
                    is_auto=False,
                ))

    await db.commit()
    return {"message": "updated"}


@router.delete("/{image_id}")
async def delete_image(
    image_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    image = await db.get(Image, image_id)
    if not image or image.user_id != user.id:
        raise HTTPException(status_code=404, detail="Image not found")

    # Remove files
    if image.file_path and os.path.exists(image.file_path):
        os.remove(image.file_path)
    if image.thumbnail_path and os.path.exists(image.thumbnail_path):
        os.remove(image.thumbnail_path)

    # Update folder count
    folder = await db.get(Folder, image.folder_id)
    if folder:
        folder.image_count = max(0, (folder.image_count or 1) - 1)

    # Update associated persons' image_count before cascade deletes the records
    from app.models.person import Person
    ip_result = await db.execute(
        select(ImagePerson).where(ImagePerson.image_id == image.id)
    )
    affected_persons = []
    for ip in ip_result.scalars():
        affected_persons.append(ip.person_id)
    if affected_persons:
        persons_result = await db.execute(
            select(Person).where(Person.id.in_(affected_persons))
        )
        for person in persons_result.scalars():
            person.image_count = max(0, (person.image_count or 1) - 1)

    await db.delete(image)
    await db.commit()
    return {"message": "deleted"}


@router.get("/{image_id}/thumbnail")
async def get_thumbnail(image_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from fastapi.responses import FileResponse
    image = await db.get(Image, image_id)
    if not image or image.user_id != user.id:
        raise HTTPException(status_code=404, detail="Image not found")
    if not image.thumbnail_path or not os.path.exists(image.thumbnail_path):
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(image.thumbnail_path)


@router.get("/{image_id}/original")
async def get_original(image_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from fastapi.responses import FileResponse
    image = await db.get(Image, image_id)
    if not image or image.user_id != user.id:
        raise HTTPException(status_code=404, detail="Image not found")
    if not image.file_path or not os.path.exists(image.file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(image.file_path)


@router.post("/{image_id}/reprocess")
async def reprocess_image(
    image_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-trigger AI processing for an image (caption + classification + faces)."""
    image = await db.get(Image, image_id)
    if not image or image.user_id != user.id:
        raise HTTPException(status_code=404, detail="Image not found")

    from app.tasks.processing import process_new_image
    process_new_image.delay(str(image.id), enable_caption=True, enable_faces=True)
    image.processing_status = "pending"
    await db.commit()
    return {"message": "reprocessing queued"}
