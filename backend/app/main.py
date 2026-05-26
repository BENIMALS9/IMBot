import asyncio
import json
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST, ProcessCollector
from starlette.responses import Response

from app.core.config import get_settings
from app.core.database import init_db, engine
from app.core.metrics import (
    HTTP_REQUESTS_TOTAL, HTTP_REQUEST_DURATION, HTTP_REQUESTS_INFLIGHT,
    HEALTH_STATUS, DB_POOL_AVAILABLE, DB_POOL_SIZE,
)
from app.api import auth, folders, images, search, categories, persons, albums, admin

# Collect process metrics (CPU, memory, FDs) — guard against reload double-registration
try:
    ProcessCollector()
except ValueError:
    pass


async def _retry_queued_images():
    """Background task: periodically re-submit pending images to the processing service."""
    import httpx
    from sqlalchemy import select, update
    from app.models.image import Image

    await asyncio.sleep(10)  # Wait for app to fully start

    while True:
        try:
            from app.core.database import async_session
            async with async_session() as db:
                result = await db.execute(
                    select(Image.id).where(Image.processing_status == "pending")
                )
                pending_ids = [str(row[0]) for row in result.fetchall()]

            if pending_ids:
                async with httpx.AsyncClient(timeout=5) as client:
                    for img_id in pending_ids:
                        try:
                            await client.post(
                                "http://processing:8002/process",
                                json={"image_id": img_id, "enable_caption": True, "enable_faces": True},
                            )
                        except Exception:
                            break  # Processing service still down, stop trying
            await asyncio.sleep(30)
        except Exception:
            await asyncio.sleep(30)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    retry_task = asyncio.create_task(_retry_queued_images())
    yield
    retry_task.cancel()


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Prometheus HTTP middleware ----
@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    path = request.url.path
    if path == "/metrics":
        return await call_next(request)

    method = request.method
    start = time.perf_counter()
    HTTP_REQUESTS_INFLIGHT.inc()

    response = await call_next(request)

    duration = time.perf_counter() - start
    HTTP_REQUESTS_INFLIGHT.dec()

    route = request.scope.get("route")
    endpoint = route.path if route else path

    HTTP_REQUEST_DURATION.labels(method=method, endpoint=endpoint).observe(duration)
    HTTP_REQUESTS_TOTAL.labels(method=method, endpoint=endpoint, status=response.status_code).inc()

    return response


@app.get("/metrics")
async def metrics():
    _refresh_pool_gauges()
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


# ---- Health endpoint with dependency checks ----
@app.get("/api/health")
async def health():
    checks: dict[str, str] = {"api": "ok"}

    # Database
    try:
        import asyncpg
        db_url = settings.database_url.replace("+asyncpg", "")
        conn = await asyncpg.connect(db_url, timeout=3)
        await conn.execute("SELECT 1")
        await conn.close()
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"

    # Redis
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.redis_url, socket_connect_timeout=2)
        await r.ping()
        await r.aclose()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"

    # Ollama (non-critical)
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{settings.ollama_base_url.rstrip('/v1')}/api/tags", timeout=3
            )
            checks["ollama"] = "ok" if resp.status_code == 200 else "error"
    except Exception:
        checks["ollama"] = "unavailable"

    # Processing Service
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.get("http://processing:8002/health", timeout=3)
            checks["processing"] = "ok" if resp.status_code == 200 else "error"
    except Exception:
        checks["processing"] = "unavailable"

    # Update Prometheus health gauges
    for comp in ("database", "redis", "ollama", "processing"):
        HEALTH_STATUS.labels(component=comp).set(1 if checks.get(comp) == "ok" else 0)

    db_ok = checks.get("database") == "ok"
    return Response(
        content=json.dumps({"status": "ok" if db_ok else "degraded", "checks": checks}),
        media_type="application/json",
        status_code=200 if db_ok else 503,
    )


def _refresh_pool_gauges():
    """Update live database pool gauges from SQLAlchemy engine."""
    try:
        pool = engine.pool
        DB_POOL_SIZE.set(pool.size())
        DB_POOL_AVAILABLE.set(pool.size() - pool.checkedout())
    except Exception:
        pass


# ---- Routers ----
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(folders.router, prefix="/api/folders", tags=["Folders"])
app.include_router(images.router, prefix="/api/images", tags=["Images"])
app.include_router(search.router, prefix="/api/search", tags=["Search"])
app.include_router(categories.router, prefix="/api/categories", tags=["Categories"])
app.include_router(persons.router, prefix="/api/persons", tags=["Persons"])
app.include_router(albums.router, prefix="/api/albums", tags=["Albums"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
