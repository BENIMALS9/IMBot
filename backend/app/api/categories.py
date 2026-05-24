from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.category import Category

router = APIRouter()

# Default category tree seed data
DEFAULT_CATEGORIES = [
    {"name": "风景", "slug": "landscape", "level": 1, "icon": "🌄", "children": [
        {"name": "自然景观", "slug": "natural", "level": 2, "children": [
            {"name": "山脉", "slug": "mountains", "level": 3},
            {"name": "湖泊/河流", "slug": "water", "level": 3},
            {"name": "海洋/海滩", "slug": "ocean", "level": 3},
            {"name": "森林", "slug": "forest", "level": 3},
            {"name": "草原/沙漠", "slug": "grassland", "level": 3},
            {"name": "天空", "slug": "sky", "level": 3},
            {"name": "花卉/植物", "slug": "flowers", "level": 3},
        ]},
        {"name": "人文景观", "slug": "cultural-landscape", "level": 2, "children": [
            {"name": "城市天际线", "slug": "cityscape", "level": 3},
            {"name": "建筑/地标", "slug": "architecture", "level": 3},
            {"name": "街道/巷弄", "slug": "street", "level": 3},
            {"name": "桥梁", "slug": "bridge", "level": 3},
            {"name": "园林/公园", "slug": "garden", "level": 3},
        ]},
    ]},
    {"name": "人像", "slug": "portrait", "level": 1, "icon": "👤", "children": [
        {"name": "单人", "slug": "single-person", "level": 2},
        {"name": "多人/合影", "slug": "group-photo", "level": 2},
        {"name": "艺术人像", "slug": "artistic-portrait", "level": 2},
    ]},
    {"name": "历史古迹", "slug": "historical", "level": 1, "icon": "🏛️", "children": [
        {"name": "中国古迹", "slug": "chinese-historical", "level": 2},
        {"name": "世界古迹", "slug": "world-historical", "level": 2},
        {"name": "文化遗产", "slug": "cultural-heritage", "level": 2},
    ]},
    {"name": "动物", "slug": "animals", "level": 1, "icon": "🐱", "children": [
        {"name": "猫", "slug": "cat", "level": 2},
        {"name": "狗", "slug": "dog", "level": 2},
        {"name": "鸟类", "slug": "bird", "level": 2},
        {"name": "水生动物", "slug": "aquatic", "level": 2},
        {"name": "野生动物", "slug": "wildlife", "level": 2},
    ]},
    {"name": "美食", "slug": "food", "level": 1, "icon": "🍜", "children": [
        {"name": "中餐", "slug": "chinese-food", "level": 2},
        {"name": "西餐", "slug": "western-food", "level": 2},
        {"name": "甜品", "slug": "dessert", "level": 2},
    ]},
    {"name": "游戏", "slug": "gaming", "level": 1, "icon": "🎮", "children": [
        {"name": "游戏截图", "slug": "game-screenshot", "level": 2},
        {"name": "游戏原画", "slug": "game-art", "level": 2},
        {"name": "游戏设备", "slug": "gaming-gear", "level": 2},
    ]},
    {"name": "文档/截图", "slug": "documents", "level": 1, "icon": "📄", "children": [
        {"name": "文档", "slug": "document", "level": 2},
        {"name": "截图", "slug": "screenshot", "level": 2},
        {"name": "票据/收据", "slug": "receipt", "level": 2},
    ]},
    {"name": "其他", "slug": "other", "level": 1, "icon": "📁", "children": []},
]


async def _seed_categories(user_id, db: AsyncSession):
    """Seed default category tree for a user."""
    async def create_children(parent_id, children, user_id):
        for child_def in children:
            child = Category(
                user_id=user_id,
                name=child_def["name"],
                slug=f"{user_id}-{child_def['slug']}",
                parent_id=parent_id,
                level=child_def["level"],
                icon=child_def.get("icon"),
            )
            db.add(child)
            await db.flush()
            if "children" in child_def:
                await create_children(child.id, child_def["children"], user_id)

    for cat_def in DEFAULT_CATEGORIES:
        cat = Category(
            user_id=user_id,
            name=cat_def["name"],
            slug=f"{user_id}-{cat_def['slug']}",
            level=1,
            icon=cat_def.get("icon"),
        )
        db.add(cat)
        await db.flush()
        if "children" in cat_def:
            await create_children(cat.id, cat_def["children"], user_id)


@router.get("")
async def get_categories(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Category).where(Category.user_id == user.id).order_by(Category.level, Category.sort_order)
    )
    categories = result.scalars().all()

    def build_tree(items, parent_id=None):
        tree = []
        for item in items:
            if item.parent_id == parent_id:
                node = {
                    "id": str(item.id), "name": item.name, "slug": item.slug.replace(f"{user.id}-", ""),
                    "level": item.level, "icon": item.icon,
                    "children": build_tree(items, item.id),
                }
                tree.append(node)
        return tree

    return build_tree(categories)


@router.post("")
async def create_category(
    name: str,
    parent_id: str | None = None,
    icon: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    slug = f"{user.id}-{name.lower().replace(' ', '-')}"
    level = 1
    if parent_id:
        parent = await db.get(Category, parent_id)
        if not parent or parent.user_id != user.id:
            raise HTTPException(status_code=404, detail="Parent category not found")
        level = parent.level + 1

    cat = Category(user_id=user.id, name=name, slug=slug, parent_id=parent_id, level=level, icon=icon)
    db.add(cat)
    await db.commit()
    return {"id": str(cat.id), "name": cat.name, "slug": slug}


@router.delete("/{category_id}")
async def delete_category(
    category_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cat = await db.get(Category, category_id)
    if not cat or cat.user_id != user.id:
        raise HTTPException(status_code=404, detail="Category not found")
    await db.delete(cat)
    await db.commit()
    return {"message": "deleted"}
