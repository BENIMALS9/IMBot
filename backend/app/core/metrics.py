"""
Shared Prometheus metric definitions.

Used by:
- app.main.metrics_middleware (HTTP-layer metrics)
- app.tasks.processing (AI pipeline metrics)
- app.tasks.celery_app (worker metrics server + GPU/Redis gauges)

Naming convention: imagedb_{domain}_{name}_{unit}
"""

from prometheus_client import Counter, Histogram, Gauge, Info

# ---------------------------------------------------------------------------
# HTTP layer (api:8000/metrics)
# ---------------------------------------------------------------------------

HTTP_REQUESTS_TOTAL = Counter(
    "imagedb_http_requests_total",
    "Total HTTP requests served",
    ["method", "endpoint", "status"],
)

HTTP_REQUEST_DURATION = Histogram(
    "imagedb_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint"],
    buckets=(.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10),
)

HTTP_REQUESTS_INFLIGHT = Gauge(
    "imagedb_http_requests_inflight",
    "HTTP requests currently being processed",
)

# ---------------------------------------------------------------------------
# Health (api:8000/metrics)
# ---------------------------------------------------------------------------

HEALTH_STATUS = Gauge(
    "imagedb_health",
    "Component health status (1=ok, 0=error/unavailable)",
    ["component"],
)

DB_POOL_SIZE = Gauge(
    "imagedb_db_pool_size",
    "Database connection pool — total connections",
)

DB_POOL_AVAILABLE = Gauge(
    "imagedb_db_pool_available",
    "Database connection pool — available (idle) connections",
)

# ---------------------------------------------------------------------------
# AI Pipeline (worker:8001/metrics)
# ---------------------------------------------------------------------------

PROCESSING_TOTAL = Counter(
    "imagedb_processing_total",
    "AI pipeline completions by stage and status",
    ["stage", "status"],
)

PROCESSING_DURATION = Histogram(
    "imagedb_processing_duration_seconds",
    "Per-stage processing duration in seconds",
    ["stage"],
    buckets=(1, 2.5, 5, 10, 20, 30, 60, 120, 300, 600),
)

PROCESSING_QUEUE_DELAY = Histogram(
    "imagedb_processing_queue_delay_seconds",
    "Queue delay: time from image creation to processing start",
    buckets=(.1, .5, 1, 2, 5, 10, 30, 60, 120, 300),
)

VLM_CALLS_TOTAL = Counter(
    "imagedb_vlm_calls_total",
    "VLM API call outcomes",
    ["status"],
)

FACES_DETECTED = Histogram(
    "imagedb_faces_detected_total",
    "Faces detected per image",
    buckets=(0, 1, 2, 3, 5, 10, 20, 50),
)

# ---------------------------------------------------------------------------
# Infrastructure (worker:8001/metrics)
# ---------------------------------------------------------------------------

GPU_UTILIZATION = Gauge(
    "imagedb_gpu_utilization_pct",
    "GPU utilization percentage (per GPU)",
    ["device"],
)

GPU_MEMORY_USED = Gauge(
    "imagedb_gpu_memory_used_bytes",
    "GPU memory used in bytes (per GPU)",
    ["device"],
)

GPU_MEMORY_TOTAL = Gauge(
    "imagedb_gpu_memory_total_bytes",
    "GPU memory total in bytes (per GPU)",
    ["device"],
)

GPU_TEMPERATURE = Gauge(
    "imagedb_gpu_temperature_celsius",
    "GPU temperature in Celsius (per GPU)",
    ["device"],
)

REDIS_QUEUE_LENGTH = Gauge(
    "imagedb_redis_queue_length",
    "Celery task queue depth from Redis",
    ["queue"],
)

WORKER_UPTIME = Gauge(
    "imagedb_worker_uptime_seconds",
    "Worker process uptime in seconds",
)

IMAGEDB_INFO = Info(
    "imagedb_build",
    "ImageDB version and build info",
)
