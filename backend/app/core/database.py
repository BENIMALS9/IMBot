from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy import create_engine

from app.core.config import get_settings

settings = get_settings()

# Async engine (for FastAPI web layer)
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_size=5,
    max_overflow=10,
    pool_recycle=3600,
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Sync engine (for Processing Service workers)
_sync_url = settings.database_url.replace("+asyncpg", "")
sync_engine = create_engine(
    _sync_url,
    echo=settings.debug,
    pool_size=5,
    max_overflow=10,
    pool_recycle=3600,
)
SyncSession = sessionmaker(bind=sync_engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
        # Migrations for existing tables
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path VARCHAR(500)"))
        except Exception:
            pass
        try:
            await conn.execute(text("ALTER TABLE images ADD COLUMN IF NOT EXISTS processing_status VARCHAR(20) DEFAULT 'pending'"))
        except Exception:
            pass
