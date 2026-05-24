from celery import Celery
from celery.signals import worker_process_init
from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "imagedb",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
    worker_concurrency=1,
    worker_prefetch_multiplier=1,
    task_track_started=True,
)


@worker_process_init.connect
def _on_worker_process_init(sender, **kwargs):
    """Dispose the async engine pool when a new worker process forks.
    This prevents 'Future attached to a different loop' errors caused by
    the parent process's event-loop-bound connections being reused."""
    from app.core.database import engine
    import asyncio
    loop = asyncio.new_event_loop()
    loop.run_until_complete(engine.dispose())


celery_app.autodiscover_tasks(["app.tasks.processing"])
