from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.image import Image
from app.models.category import Category, ImageCategory
from app.models.person import Person, ImagePerson
from app.models.tag import Tag
from app.schemas.image import ImageResponse
from app.schemas import PaginatedResponse

router = APIRouter()


STOP_WORDS = set("的了在是和都有个也就要对从到与及或但把被让给向到以而".split())


def _extract_keywords(captions: list[str], limit: int = 50) -> list[str]:
    """Extract meaningful Chinese keywords from captions using jieba."""
    import jieba
    freq: dict[str, int] = {}
    for cap in captions:
        if not cap:
            continue
        words = jieba.cut(cap)
        for w in words:
            w = w.strip()
            if (
                2 <= len(w) <= 4
                and all("一" <= c <= "鿿" for c in w)  # Chinese chars only
                and w not in STOP_WORDS
            ):
                freq[w] = freq.get(w, 0) + 1
    return [w for w, _ in sorted(freq.items(), key=lambda x: -x[1])[:limit]]


@router.get("/suggestions")
async def suggestions(
    q: str | None = Query(None, description="Autocomplete query"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return search suggestions.

    Without ?q= : 10 random categories + 6 random hot keywords.
    With ?q=    : autocomplete across filenames, cameras, persons, categories, keywords.
    """
    import random

    # --- Autocomplete mode ---
    if q and len(q) >= 1:
        items: list[dict] = []
        like = f"%{q}%"

        # Filenames (distinct original_name)
        fn_result = await db.execute(
            select(Image.original_name)
            .where(Image.user_id == user.id, Image.original_name.ilike(like))
            .distinct()
            .limit(5)
        )
        for (name,) in fn_result:
            if name:
                items.append({"label": name, "type": "文件名"})

        # Camera models
        cam_result = await db.execute(
            select(Image.camera_model)
            .where(Image.user_id == user.id, Image.camera_model.ilike(like))
            .distinct()
            .limit(3)
        )
        for (cam,) in cam_result:
            if cam:
                items.append({"label": cam, "type": "相机"})

        # Persons
        person_result = await db.execute(
            select(Person.name)
            .where(Person.user_id == user.id, Person.name.ilike(like))
            .limit(5)
        )
        for (name,) in person_result:
            if name:
                items.append({"label": name, "type": "人物"})

        # Categories
        cat_result = await db.execute(
            select(Category.name)
            .where(Category.user_id == user.id, Category.name.ilike(like))
            .limit(5)
        )
        for (name,) in cat_result:
            items.append({"label": name, "type": "分类"})

        # Hot keywords (pre-extracted, filter by match)
        cap_result = await db.execute(
            select(Image.caption_ai).where(
                Image.user_id == user.id,
                Image.caption_ai.isnot(None),
            )
        )
        captions = [c for (c,) in cap_result if c]
        keywords = _extract_keywords(captions, limit=50)
        for kw in keywords:
            if q in kw:
                items.append({"label": kw, "type": "热词"})

        return items[:20]

    # --- Default mode: random suggestions ---
    cat_result = await db.execute(
        select(Category.name)
        .where(Category.user_id == user.id)
        .order_by(func.random())
        .limit(10)
    )
    categories = [{"label": name, "type": "分类"} for (name,) in cat_result]

    cap_result = await db.execute(
        select(Image.caption_ai).where(
            Image.user_id == user.id,
            Image.caption_ai.isnot(None),
        )
    )
    captions = [c for (c,) in cap_result if c]
    keywords = _extract_keywords(captions, limit=50)
    hot_picks = random.sample(keywords, min(6, len(keywords)))

    return categories + [{"label": w, "type": "热词"} for w in hot_picks]



@router.get("", response_model=PaginatedResponse)
async def search(
    q: str | None = Query(None, description="Text search query"),
    scope: str | None = Query("all", description="Search scope: all, name, person, camera, description, location"),
    category: str | None = None,
    person_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    tag: str | None = None,
    sort: str = "date_taken",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Image).where(Image.user_id == user.id)
    count_query = select(func.count(Image.id)).where(Image.user_id == user.id)

    if q:
        search_term = f"%{q}%"

        scope_filters = {
            "name": [Image.original_name.ilike(search_term)],
            "person": [Image.id.in_(
                select(ImagePerson.image_id).join(Person).where(
                    Person.name.ilike(search_term),
                    Person.user_id == user.id,
                )
            )],
            "camera": [Image.camera_model.ilike(search_term), Image.lens_model.ilike(search_term)],
            "description": [Image.caption_ai.ilike(search_term), Image.user_notes.ilike(search_term)],
            "location": [Image.location_name.ilike(search_term)],
        }

        if scope in scope_filters:
            conditions = scope_filters[scope]
        else:
            # "all" — search across all text fields
            conditions = [
                Image.caption_ai.ilike(search_term),
                Image.user_notes.ilike(search_term),
                Image.original_name.ilike(search_term),
                Image.location_name.ilike(search_term),
                Image.camera_model.ilike(search_term),
            ]

        filter_clause = conditions[0] if len(conditions) == 1 else or_(*conditions)
        query = query.where(filter_clause)
        count_query = count_query.where(filter_clause)

    # Additional filters (reuse logic from images.list_images)
    # ... simplified for now

    query = query.order_by(Image.date_taken.desc().nulls_last())
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    images = result.scalars().all()

    return PaginatedResponse(
        items=[ImageResponse.model_validate(img) for img in images],
        total=total, page=page, page_size=page_size,
    )
