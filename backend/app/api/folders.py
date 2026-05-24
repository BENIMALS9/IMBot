from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.folder import Folder

router = APIRouter()


@router.get("")
async def list_folders(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Folder).where(Folder.user_id == user.id).order_by(Folder.name)
    )
    folders = result.scalars().all()

    def build_tree(items, parent_id=None):
        tree = []
        for item in items:
            if item.parent_id == parent_id:
                node = {
                    "id": str(item.id),
                    "name": item.name,
                    "description": item.description,
                    "image_count": item.image_count,
                    "created_at": item.created_at.isoformat() if item.created_at else None,
                    "children": build_tree(items, item.id),
                }
                tree.append(node)
        return tree

    return build_tree(folders)


@router.post("")
async def create_folder(
    name: str,
    parent_id: str | None = None,
    description: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    folder = Folder(user_id=user.id, name=name, description=description, parent_id=parent_id)
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return {"id": str(folder.id), "name": folder.name}


@router.put("/{folder_id}")
async def update_folder(
    folder_id: str,
    name: str | None = None,
    description: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    folder = await db.get(Folder, folder_id)
    if not folder or folder.user_id != user.id:
        raise HTTPException(status_code=404, detail="Folder not found")
    if name is not None:
        folder.name = name
    if description is not None:
        folder.description = description
    await db.commit()
    return {"message": "updated"}


@router.delete("/{folder_id}")
async def delete_folder(
    folder_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    folder = await db.get(Folder, folder_id)
    if not folder or folder.user_id != user.id:
        raise HTTPException(status_code=404, detail="Folder not found")
    await db.delete(folder)
    await db.commit()
    return {"message": "deleted"}
