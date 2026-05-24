"""AI processing tasks — async image processing pipeline.

Pipeline steps run sequentially within a single task to avoid DB pool contention:
1. generate_caption_and_classify — VLM caption + keyword-based classification
2. detect_faces — face detection + recognition via InsightFace

Each step records its status in the ProcessingTask table for progress tracking.
"""

import asyncio
import os
from datetime import datetime, timezone
from pathlib import Path

from app.tasks.celery_app import celery_app


# ---------------------------------------------------------------------------
# Orchestrator — runs both steps sequentially
# ---------------------------------------------------------------------------

@celery_app.task(name="process_new_image")
def process_new_image(image_id: str, enable_caption: bool = True, enable_faces: bool = True):
    """Run the full AI pipeline sequentially."""
    result = _run_async(_async_pipeline(image_id, enable_caption, enable_faces))
    return result


async def _async_pipeline(image_id: str, enable_caption: bool = True, enable_faces: bool = True):
    """Run caption+classify then face detection, each with its own DB session.
    Records progress in ProcessingTask table for frontend status display."""
    caption_result = await _async_caption_and_classify(image_id) if enable_caption else {"status": "skipped", "reason": "disabled by user"}
    faces_result = await _async_detect_faces(image_id) if enable_faces else {"status": "skipped", "reason": "disabled by user"}

    # Mark image as fully processed
    await _update_image_status(image_id, "done")

    return {
        "image_id": image_id,
        "caption": caption_result,
        "faces": faces_result,
    }


# ---------------------------------------------------------------------------
# ProcessingTask helpers
# ---------------------------------------------------------------------------

async def _create_task(db, image_id: str, task_type: str):
    from app.models.processing_task import ProcessingTask
    task = ProcessingTask(
        image_id=image_id,
        task_type=task_type,
        status="running",
        started_at=datetime.now(timezone.utc),
    )
    db.add(task)
    await db.flush()
    return task


async def _finish_task(db, task, status: str = "done", result: dict | None = None, error: str | None = None):
    task.status = status
    task.completed_at = datetime.now(timezone.utc)
    if result:
        task.result = result
    if error:
        task.error_message = error
    await db.flush()


async def _update_image_status(image_id: str, status: str):
    from app.models.image import Image
    from app.core.database import async_session
    async with async_session() as db:
        img = await db.get(Image, image_id)
        if img:
            img.processing_status = status
            await db.commit()


# ---------------------------------------------------------------------------
# VLM caption + classification
# ---------------------------------------------------------------------------

async def _async_caption_and_classify(image_id: str):
    from sqlalchemy import select
    from app.models.image import Image
    from app.models.category import Category, ImageCategory
    from app.core.database import async_session

    async with async_session() as db:
        image = await db.get(Image, image_id)
        if not image or not image.file_path or not os.path.exists(image.file_path):
            return {"status": "error", "error": "Image not found"}

        # Record task
        image.processing_status = "captioning"
        task = await _create_task(db, image_id, "caption_and_classify")
        await db.commit()

        result = await db.execute(
            select(Category).where(Category.user_id == image.user_id)
        )
        categories = result.scalars().all()

        from app.services.vlm_provider import get_vlm_provider
        provider = get_vlm_provider()
        if not provider:
            await _finish_task(db, task, "done", {"reason": "no vlm provider"})
            await db.commit()
            return {"status": "skipped", "reason": "no vlm provider"}

        slug_to_cat = {cat.slug: cat for cat in categories} if categories else {}

        # Build prompt: caption + category names listed for the model to pick from
        if categories:
            cat_names = "、".join(cat.name for cat in categories)
            prompt = (
                f"描述这张图片（中文，不超过80字），然后从以下分类中选出最相关的1-3个，写在\"分类：\"后面。\n"
                f"可选分类：{cat_names}"
            )
        else:
            prompt = "请用中文描述这张图片的内容，不超过100字。"

        caption = ""
        matched_slugs = []

        try:
            response = await provider.describe_image(image.file_path, prompt)
            raw = response.caption.strip()
        except Exception as e:
            import httpx
            is_timeout = isinstance(e, httpx.TimeoutException)
            error_msg = "VLM 请求超时，请重试" if is_timeout else str(e)
            status = "timeout" if is_timeout else "error"
            await _finish_task(db, task, status, error=error_msg)
            await db.commit()
            image.processing_status = status
            await db.commit()
            return {"status": status, "error": error_msg}

        # Retry once if empty
        if not raw:
            try:
                response = await provider.describe_image(image.file_path, "请用中文描述这张图片的内容，不超过100字。")
                raw = response.caption.strip()
            except Exception:
                raw = ""

        # Parse: split on "分类：" or "类别：" or "categories:" to separate caption from categories
        import re
        parts = re.split(r"分类[：:]|类别[：:]|[Cc]ategor", raw, maxsplit=1)
        caption = parts[0].strip().rstrip("，。,.")
        cat_text = parts[1].strip() if len(parts) > 1 else ""

        if cat_text and categories:
            # Clean up the classification text, then match category names
            cat_text = re.sub(r"[\d]+[.、]|相关分类[：:]|\n", "", cat_text)
            for cat in categories:
                if cat.name in cat_text:
                    matched_slugs.append(cat.slug)

        # Fallback: if no categories found via parsing, search for cat names in full response
        if not matched_slugs and categories:
            for cat in categories:
                if cat.name in raw:
                    matched_slugs.append(cat.slug)

        image.caption_ai = caption if caption else raw

        for slug in matched_slugs:
            cat = slug_to_cat.get(slug)
            if cat:
                exists = await db.scalar(
                    select(ImageCategory.id).where(
                        ImageCategory.image_id == image.id,
                        ImageCategory.category_id == cat.id,
                    )
                )
                if not exists:
                    db.add(ImageCategory(
                        image_id=image.id,
                        category_id=cat.id,
                        confidence=0.9,
                        is_auto=True,
                    ))

        matched_names = [slug_to_cat[s].name for s in matched_slugs if s in slug_to_cat]
        await _finish_task(db, task, "done", {
            "caption": caption if caption else raw,
            "categories": matched_names,
        })
        await db.commit()
        return {
            "status": "done",
            "caption": caption if caption else raw,
            "categories": matched_names,
        }


# ---------------------------------------------------------------------------
# Face detection + recognition (InsightFace)
# ---------------------------------------------------------------------------

_face_app = None


def _get_face_app():
    global _face_app
    if _face_app is None:
        import insightface
        model_root = os.path.join(
            os.path.dirname(__file__), "..", "..", "data", "insightface_models"
        )
        os.makedirs(model_root, exist_ok=True)
        _face_app = insightface.app.FaceAnalysis(
            name="buffalo_l",
            root=model_root,
            providers=["CPUExecutionProvider"],
        )
        _face_app.prepare(ctx_id=-1, det_size=(640, 640))
    return _face_app


async def _async_detect_faces(image_id: str):
    from sqlalchemy import select, func
    from app.models.image import Image
    from app.models.person import Person, ImagePerson
    from app.core.database import async_session

    async with async_session() as db:
        image = await db.get(Image, image_id)
        if not image or not image.file_path or not os.path.exists(image.file_path):
            return {"status": "error", "error": "Image not found"}

        from app.core.config import get_settings
        if not get_settings().enable_face_recognition:
            return {"status": "skipped", "reason": "disabled"}

        # Record task
        image.processing_status = "faces"
        task = await _create_task(db, image_id, "detect_faces")
        await db.commit()

        try:
            app = _get_face_app()
            img_bgr = _load_image_bgr(image.file_path)
            faces = app.get(img_bgr)
        except Exception as e:
            await _finish_task(db, task, "error", error=str(e))
            await db.commit()
            return {"status": "error", "error": f"Detection failed: {e}"}

        if not faces:
            await _finish_task(db, task, "done", {"faces_found": 0})
            await db.commit()
            return {"status": "done", "faces_found": 0}

        existing_persons = await db.execute(
            select(Person).where(
                Person.user_id == image.user_id,
                Person.face_embedding.isnot(None),
            )
        )
        person_list = existing_persons.scalars().all()

        results = []
        for face in faces:
            embedding = face.normed_embedding.tolist() if face.normed_embedding is not None else None
            bbox = {
                "x": int(face.bbox[0]), "y": int(face.bbox[1]),
                "w": int(face.bbox[2] - face.bbox[0]),
                "h": int(face.bbox[3] - face.bbox[1]),
            }

            if embedding is None:
                continue

            matched_person = None
            best_similarity: float = 0.55

            for person in person_list:
                sim = _cosine_similarity(embedding, person.face_embedding)
                if sim > best_similarity:
                    best_similarity = float(sim)
                    matched_person = person

            if matched_person:
                person = matched_person
            else:
                face_label = f"face_{str(image.id)[:8]}"
                person = Person(
                    user_id=image.user_id,
                    name=None,
                    slug=face_label,
                    face_embedding=embedding,
                )
                db.add(person)
                await db.flush()

            # Skip if this image-person association already exists (re-processing guard)
            existing_ip = await db.scalar(
                select(ImagePerson.id).where(
                    ImagePerson.image_id == image.id,
                    ImagePerson.person_id == person.id,
                )
            )
            if existing_ip:
                results.append({
                    "person_id": str(person.id),
                    "person_name": person.name,
                    "confidence": round(best_similarity, 4),
                    "bbox": bbox,
                    "is_new": False,
                    "skipped": True,
                })
                continue

            db.add(ImagePerson(
                image_id=image.id,
                person_id=person.id,
                face_bbox=bbox,
                confidence=round(best_similarity, 4),
            ))

            count = await db.scalar(
                select(func.count(ImagePerson.id)).where(
                    ImagePerson.person_id == person.id
                )
            )
            person.image_count = count or 0

            if not person.face_thumbnail:
                face_path = _save_face_thumbnail(image.file_path, bbox, person.id)
                if face_path:
                    person.face_thumbnail = face_path

            results.append({
                "person_id": str(person.id),
                "person_name": person.name,
                "confidence": round(best_similarity, 4),
                "bbox": bbox,
                "is_new": matched_person is None,
            })

        await _finish_task(db, task, "done", {
            "faces_found": len(results),
            "faces": results,
        })
        await db.commit()
        return {
            "status": "done",
            "faces_found": len(results),
            "faces": results,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run_async(coro):
    """Run an async coroutine in a fresh event loop with a clean engine pool.

    Disposes the global async engine pool before creating a new event loop to
    prevent 'Future attached to a different loop' errors from connections that
    were created in a previous asyncio.run() call's event loop.
    """
    import asyncio
    from app.core.database import engine

    # Dispose stale pool from any previous event loop before creating a new one
    async def _dispose():
        await engine.dispose()
    try:
        asyncio.run(_dispose())
    except Exception:
        pass

    return asyncio.run(coro)


def _load_image_bgr(filepath: str):
    import cv2
    img = cv2.imread(filepath)
    if img is None:
        raise ValueError(f"Cannot read image: {filepath}")
    return img


def _save_face_thumbnail(image_path: str, bbox: dict, person_id) -> str | None:
    import cv2
    from app.core.config import get_settings
    settings = get_settings()
    face_dir = os.path.join(settings.storage_path, "..", "face_thumbnails")
    os.makedirs(face_dir, exist_ok=True)

    img = cv2.imread(image_path)
    if img is None:
        return None

    h, w = img.shape[:2]
    x = max(0, bbox["x"] - int(bbox["w"] * 0.15))
    y = max(0, bbox["y"] - int(bbox["h"] * 0.15))
    bw = min(w - x, int(bbox["w"] * 1.3))
    bh = min(h - y, int(bbox["h"] * 1.3))

    if bw <= 0 or bh <= 0:
        return None

    face_img = img[y:y+bh, x:x+bw]
    pid = person_id.hex if hasattr(person_id, "hex") else str(person_id)
    filename = f"face_{pid}.jpg"
    filepath = os.path.join(face_dir, filename)
    cv2.imwrite(filepath, face_img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return filepath


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    import math
    dot = sum(float(x) * float(y) for x, y in zip(a, b))
    norm_a = math.sqrt(sum(float(x) * float(x) for x in a))
    norm_b = math.sqrt(sum(float(x) * float(x) for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))
