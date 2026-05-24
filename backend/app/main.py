from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import init_db
from app.api import auth, folders, images, search, categories, persons, albums, admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(folders.router, prefix="/api/folders", tags=["Folders"])
app.include_router(images.router, prefix="/api/images", tags=["Images"])
app.include_router(search.router, prefix="/api/search", tags=["Search"])
app.include_router(categories.router, prefix="/api/categories", tags=["Categories"])
app.include_router(persons.router, prefix="/api/persons", tags=["Persons"])
app.include_router(albums.router, prefix="/api/albums", tags=["Albums"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
