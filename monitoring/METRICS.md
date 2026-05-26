# ImageDB Metrics & Monitoring

> 基于 Prometheus + Grafana 的全栈指标监控
> 更新: 2026-05-26

---

## 1. 架构

```
┌─────────────┐     scrape /metrics     ┌──────────────┐     query     ┌─────────────┐
│  API :8000  │ ───────────────────────→ │  Prometheus  │ ←─────────── │   Grafana   │
│  (HTTP +     │                          │    :9090      │              │   :3000     │
│   Health +   │                          │  15d retention │              │  Dashboard  │
│   DB Pool)   │                          └──────────────┘              └─────────────┘
└─────────────┘                                ↑
      ▲                                        │ scrape /metrics
      │                               ┌────────┴──────┐
      │                               │  Worker :8001 │
      │                               │  (Pipeline +   │
      │                               │   GPU + Redis) │
      │                               └───────────────┘
      │
   /api/health ← Docker healthcheck (Python urllib)
```

**两个 scrape target**：
| Target | Port | 指标类别 | 间隔 |
|--------|------|---------|------|
| `api:8000/metrics` | 8000 | HTTP 请求、健康状态、DB 连接池、进程 | 10s |
| `worker:8001/metrics` | 8001 | AI 流水线、GPU、Redis 队列 | 15s |

---

## 2. 指标清单

### 2.1 HTTP 请求层（`api:8000/metrics`）

| 指标 | 类型 | 标签 | 说明 |
|------|------|------|------|
| `imagedb_http_requests_total` | Counter | method, endpoint, status | 请求累计计数 |
| `imagedb_http_request_duration_seconds` | Histogram | method, endpoint | 请求时延（buckets: 5ms~10s） |
| `imagedb_http_requests_inflight` | Gauge | — | 当前正在处理的请求数 |

> Inflight Gauge 在请求进入时 inc，完成时 dec。由于 Prometheus scrape 间隔（10s）>> 请求处理时间（ms），此值通常为 0。通过 `rate(http_requests_total)` 曲线可以看出并发趋势。

### 2.2 健康检查（`api:8000/metrics`）

| 指标 | 类型 | 标签 | 说明 |
|------|------|------|------|
| `imagedb_health` | Gauge | component | 组件健康：1=OK, 0=Error（database / redis / ollama） |
| `imagedb_db_pool_size` | Gauge | — | 连接池总大小 |
| `imagedb_db_pool_available` | Gauge | — | 连接池当前可用连接数 |

健康状态通过 `/api/health` 端点检测，结果同步到 Prometheus Gauge。Grafana 面板用红/绿阈值显示。

### 2.3 AI 流水线（`worker:8001/metrics`）

| 指标 | 类型 | 标签 | 说明 |
|------|------|------|------|
| `imagedb_processing_total` | Counter | stage, status | 处理完成数（stage=caption\|faces, status=success\|timeout\|error\|empty） |
| `imagedb_processing_duration_seconds` | Histogram | stage | 各阶段耗时（buckets: 1s~600s） |
| `imagedb_processing_queue_delay_seconds` | Histogram | — | 排队时延：图片入库 → Worker 开始处理的等待时间（buckets: 0.1s~300s） |
| `imagedb_vlm_calls_total` | Counter | status | VLM 调用结果（success / empty / timeout / error） |
| `imagedb_faces_detected_total` | Histogram | — | 每张图片检测到的人脸数分布（buckets: 0~50） |

**排队时延计算**：
```
queue_delay = now_utc - image.created_at (UTC)
```
在 `_async_caption_and_classify` 开始时记录。

### 2.4 基础设施（`worker:8001/metrics`）

| 指标 | 类型 | 标签 | 说明 |
|------|------|------|------|
| `imagedb_gpu_utilization_pct` | Gauge | device | GPU 利用率 %（pynvml，15s 采样） |
| `imagedb_gpu_memory_used_bytes` | Gauge | device | GPU 显存已用 |
| `imagedb_gpu_memory_total_bytes` | Gauge | device | GPU 显存总量 |
| `imagedb_gpu_temperature_celsius` | Gauge | device | GPU 温度 °C |
| `imagedb_redis_queue_length` | Gauge | queue | Celery 队列积压深度 |
| `imagedb_worker_uptime_seconds` | Gauge | — | Worker 进程运行时长 |
| `imagedb_build` | Info | — | 版本信息（version, vlm_provider） |

GPU 指标通过 `nvidia-ml-py3` (pynvml) 库查询，每秒在后台线程采集一次，Gauge 每 15s 更新。

### 2.5 进程指标（自动采集）

来自 `prometheus_client.ProcessCollector`：
- `process_cpu_seconds_total` — CPU 时间
- `process_resident_memory_bytes` / `process_virtual_memory_bytes` — 内存
- `process_open_fds` / `process_max_fds` — 文件描述符
- `process_start_time_seconds` — 进程启动时间

---

## 3. Grafana 面板布局

```
┌──────────────────────────────────────────────────────────────┐
│  Row 1: HTTP Overview                                        │
│  ┌───────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ Throughput│ │ Latency      │ │ Status Codes │            │
│  │ (req/s)   │ │ P50/P90/P99  │ │ 2xx/4xx/5xx  │            │
│  └───────────┘ └──────────────┘ └──────────────┘            │
│  ┌─────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────┐    │
│  │ Inflight│ │Total Rate │ │ Memory   │ │ CPU (%)      │    │
│  │ (count) │ │(req/s avg)│ │ RSS/VMS  │ │ API process  │    │
│  └─────────┘ └───────────┘ └──────────┘ └──────────────┘    │
├──────────────────────────────────────────────────────────────┤
│  Row 2: Health & DB                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ DB Pool      │ │ Health       │ │ Requests by Endpoint │ │
│  │ Total/Avail  │ │ DB/Redis/O   │ │ (per-endpoint rate)  │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│  Row 3: AI Pipeline                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ Throughput   │ │ Duration     │ │ Status Breakdown     │ │
│  │ (per stage)  │ │ P50/P90      │ │ success/err/timeout  │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│  Row 4: Pipeline Detail                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────┐ ┌─────────┐ │
│  │ Queue Delay  │ │ VLM Outcomes │ │Faces/Img│ │Redis Q  │ │
│  │ P50/P90/P99  │ │ by status    │ │ (avg)   │ │(depth)  │ │
│  └──────────────┘ └──────────────┘ └─────────┘ └─────────┘ │
├──────────────────────────────────────────────────────────────┤
│  Row 5: GPU                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ Utilization% │ │ Memory Used  │ │ Temperature (°C)     │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**共 18 个面板**，覆盖 5 个维度。

---

## 4. 告警建议（待实现）

可以在 `monitoring/prometheus.yml` 中添加 `rule_files`：

```yaml
rule_files:
  - "alerts.yml"
```

建议告警规则：

| 告警 | 表达式 | 阈值 | 级别 |
|------|--------|------|------|
| API 不可用 | `up{job="imagedb-api"} == 0` | 持续 1m | Critical |
| Worker 不可用 | `up{job="imagedb-worker"} == 0` | 持续 2m | Warning |
| DB 连接池耗尽 | `imagedb_db_pool_available < 2` | 持续 5m | Warning |
| 高错误率 | `rate(http_requests_total{status=~"5.."}[5m]) > 0.1` | 持续 5m | Critical |
| 高延迟 | `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 2` | 持续 5m | Warning |
| VLM 高失败率 | `rate(vlm_calls_total{status!="success"}[10m]) / rate(vlm_calls_total[10m]) > 0.5` | 持续 5m | Warning |
| 队列积压 | `imagedb_redis_queue_length > 50` | 持续 10m | Warning |
| GPU 温度过高 | `imagedb_gpu_temperature_celsius > 85` | 持续 5m | Critical |
| 磁盘使用 > 90% | `node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.1` | 持续 5m | Critical |

---

## 5. 访问地址

| 服务 | URL | 认证 |
|------|-----|------|
| Grafana | http://localhost:3000 | 匿名 Admin |
| Prometheus | http://localhost:9090 | 无 |
| API Metrics | http://localhost:8000/metrics | 无 |
| Worker Metrics | http://localhost:8001/metrics | 无 |
| Health Check | http://localhost:8000/api/health | 无 |
