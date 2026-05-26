import os
import threading
import time
from datetime import datetime, timezone

from celery import Celery
from celery.signals import worker_process_init, worker_ready
from prometheus_client import start_http_server, REGISTRY

from app.core.config import get_settings
from app.core.metrics import (
    GPU_UTILIZATION, GPU_MEMORY_USED, GPU_MEMORY_TOTAL, GPU_TEMPERATURE,
    REDIS_QUEUE_LENGTH, WORKER_UPTIME, IMAGEDB_INFO,
)

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
    worker_pool="threads",
    worker_concurrency=2,
    worker_prefetch_multiplier=1,
    task_track_started=True,
)

METRICS_PORT = 8001
_worker_started_at: float | None = None


def _collect_gpu_metrics():
    """Periodically sample NVIDIA GPU stats via pynvml (non-blocking)."""
    try:
        import pynvml
        pynvml.nvmlInit()
        device_count = pynvml.nvmlDeviceGetCount()
        for i in range(device_count):
            handle = pynvml.nvmlDeviceGetHandleByIndex(i)
            dev = f"gpu{i}"

            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            GPU_UTILIZATION.labels(device=dev).set(util.gpu)

            mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
            GPU_MEMORY_USED.labels(device=dev).set(mem.used)
            GPU_MEMORY_TOTAL.labels(device=dev).set(mem.total)

            temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            GPU_TEMPERATURE.labels(device=dev).set(temp)
    except Exception:
        pass


def _collect_redis_queue_length():
    """Sample Celery queue depth from Redis."""
    try:
        import redis
        r = redis.from_url(settings.redis_url, socket_connect_timeout=2)
        length = r.llen("celery")
        r.close()
        REDIS_QUEUE_LENGTH.labels(queue="celery").set(length)
    except Exception:
        pass


def _metrics_collector_loop():
    """Background thread: sample GPU + Redis metrics every 15s."""
    while True:
        _collect_gpu_metrics()
        _collect_redis_queue_length()
        if _worker_started_at is not None:
            WORKER_UPTIME.set(time.time() - _worker_started_at)
        time.sleep(15)


@worker_process_init.connect
def _on_worker_process_init(sender, **kwargs):
    """Dispose parent process SQLAlchemy engine on fork, then start metrics server."""
    from app.core.database import engine
    import asyncio
    loop = asyncio.new_event_loop()
    loop.run_until_complete(engine.dispose())

    # Start Prometheus metrics HTTP server on port 8001
    start_http_server(METRICS_PORT, registry=REGISTRY)

    # Set build info
    IMAGEDB_INFO.info({"version": "0.1.0", "vlm_provider": settings.vlm_provider})


@worker_ready.connect
def _on_worker_ready(sender, **kwargs):
    """Called once when worker is fully booted. Start background metric collectors."""
    global _worker_started_at
    _worker_started_at = time.time()

    t = threading.Thread(target=_metrics_collector_loop, daemon=True)
    t.start()


celery_app.autodiscover_tasks(["app.tasks.processing"])
