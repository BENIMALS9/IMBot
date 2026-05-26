# Worker V2 — 架构重设计

> 日期: 2026-05-26
> 状态: 设计中，待实现

---

## 问题诊断

### 当前架构（V1，已损坏）

```
Celery (--pool=threads --concurrency=2)
├─ Thread 1: asyncio.run(pipeline) → asyncpg + greenlet
└─ Thread 2: asyncio.run(pipeline) → asyncpg + greenlet
```

**三重伤**：

1. **asyncpg + asyncio.run() 不可组合**
   - `asyncio.run()` 每次调用创建/销毁新的 event loop
   - asyncpg 连接绑定到创建时的 event loop
   - 线程被复用但 event loop 不存活 → 连接变僵尸
   - 错误: `InterfaceError: cannot perform operation: another operation is in progress`

2. **greenlet + 多线程 = 调度冲突**
   - SQLAlchemy async 用 greenlet 桥接 async/sync
   - 两个线程的 greenlet 同时操作 asyncpg pool 时互相污染

3. **thread-local engine 不能根治**
   - 即使每个线程有独立 engine，event loop 的创建/销毁周期仍破坏连接池
   - 每轮 `asyncio.run()` 结束，池中连接全部失效
   - 下一轮 task 复用线程时拿到死连接

### Windows 约束

- Celery `prefork` pool 不可用（依赖 `os.fork()`，Windows 不支持）
- `solo` pool: 无并行
- `threads` pool: 需要 asyncpg 配合，但以上问题无解

---

## 方案对比

| 方案 | 并行能力 | Windows | 复杂度 | 隔离性 |
|------|----------|---------|--------|--------|
| A. Process Pool + Sync DB | 2 进程 | ✓ | 中 | 强（进程隔离） |
| B. 独立 Worker 容器 ×2 | 2 容器 | ✓ | 低 | 强（容器隔离） |
| C. 独立 processing FastAPI 服务 | N 进程 | ✓ | 高 | 强 |
| D. 回归 solo pool + asyncio.gather | 仅 intra-task | ✓ | 低 | 无 |

**推荐: B (短期) → C (长期)**

---

## 方案 B: 多 Worker 实例（推荐短期方案）

### 架构

```
                   Redis Queue (Celery tasks)
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
        ┌──────────┐           ┌──────────┐
        │ Worker-1 │           │ Worker-2 │
        │  (solo)  │           │  (solo)  │
        │  sync DB │           │  sync DB │
        │  sync VLM│           │  sync VLM│
        │  sync    │           │  sync    │
        │  Insight │           │  Insight │
        │  Face    │           │  Face    │
        └──────────┘           └──────────┘
        独立容器                独立容器
        concurrency=1          concurrency=1
```

### 核心思路

**扔掉 async** — Worker 层不需要异步。FastAPI 需要 async 是因为高并发连接，但 Worker 一次只处理一张图，同步代码更简单、更可靠。

**扔掉线程** — solo pool + 两个独立容器。每个容器一个进程，用 sync DB (psycopg2) 访问 PostgreSQL。没有线程、没有 event loop、没有 greenlet。

**容器级并行** — 两个 worker 容器各自从 Redis 拉任务。Celery 的 Redis broker 天然支持多 worker 竞争消费。

### 改动清单

1. **`requirements.txt`** — 新增 `psycopg2-binary`
2. **`app/core/database.py`** — 新增 `sync_engine` + `sync_session` 工厂
3. **`app/tasks/processing_sync.py`** — 新建，同步版 pipeline
   - `process_image_sync(image_id)` — 同步执行 caption → faces
   - 使用 `sync_session` 管理 DB
   - 使用 `httpx` 或 `requests` 同步调用 Ollama API
   - InsightFace 同步运行
4. **`app/tasks/celery_app.py`** — pool 改为 solo，concurrency=1
5. **`docker-compose.yml`** — worker 部署两个实例: `worker-1` + `worker-2`

### docker-compose.yml 变化

```yaml
worker-1:
  build: ./backend
  command: celery -A app.tasks.celery_app worker --loglevel=info --pool=solo
  # ... 与现有 worker 相同配置 ...

worker-2:
  build: ./backend
  command: celery -A app.tasks.celery_app worker --loglevel=info --pool=solo
  # ... 与现有 worker 相同配置 ...
  # hostname 需要不同，避免 Celery 冲突
```

### 任务流

```
1. API 上传图片
2. process_new_image.delay(image_id)  →  进入 Redis 队列
3. Worker-1 或 Worker-2 从 Redis 拉取任务
4. process_image_sync(image_id):
   a. 读取图片记录 (sync DB)
   b. 调用 Ollama VLM (sync HTTP POST)
   c. 保存 caption + 分类 (sync DB)
   d. InsightFace 人脸检测 (sync, CPU)
   e. 保存人脸结果 (sync DB)
   f. 更新 processing_status = "done"
5. 返回结果
```

### 超时机制（三阶段）

```
图片上传
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│  ① 排队超时 (Queue Timeout)    默认: 5 分钟               │
│     任务在 Redis 队列中等待被 Worker 领取                   │
│     超时 → 标记 "queue_timeout"，自动重试 1 次             │
│     仍失败 → 标记 "failed"，通知用户手动重试                │
└────────────────────────┬─────────────────────────────────┘
                         │ Worker 领取任务
                         ▼
┌──────────────────────────────────────────────────────────┐
│  ② 等待超时 (Wait Timeout)      默认: 30 秒               │
│     已领取但等待资源（DB 连接池、模型加载、GPU 就绪）        │
│     超时 → 标记 "wait_timeout"，自动重试 1 次              │
│     仍失败 → 标记 "failed"                                │
└────────────────────────┬─────────────────────────────────┘
                         │ 开始处理
                         ▼
┌──────────────────────────────────────────────────────────┐
│  ③ 处理超时 (Processing Timeout)  默认: 2 分钟             │
│     VLM caption + 分类 + 人脸检测                          │
│     超时 → 终止子进程，标记 "timeout"，自动重试 1 次        │
│     仍失败 → 标记 "failed"，用户可手动 "重新处理"           │
└──────────────────────────────────────────────────────────┘
```

**重试策略**：

| 阶段 | 自动重试 | 重试间隔 | 失败后状态 | 用户操作 |
|------|---------|---------|-----------|---------|
| 排队超时 | 1 次 | 即时重入队 | `failed` | 手动重试 |
| 等待超时 | 1 次 | 即时重入队 | `failed` | 手动重试 |
| 处理超�� | 1 次 | 即时重入队 | `failed` | 手动重试 |

- `retry_count` 记录在 `ProcessingTask` 表
- 自动重试成功 → `retry_count: 1, status: done`
- 自动重试也失败 → `retry_count: 1, status: failed`
- 用户点"重新处理" → 重置 `retry_count`，重新入队

**Windows 实现**（不依赖 `signal.alarm`）：

```python
import threading

def _process_with_timeout(image_id: str, timeout: int = 120):
    """在独立线程中运行，主线程等待 timeout 秒"""
    result = None
    exception = None

    def _target():
        nonlocal result, exception
        try:
            result = process_image_sync(image_id)
        except Exception as e:
            exception = e

    t = threading.Thread(target=_target, daemon=True)
    t.start()
    t.join(timeout=timeout)

    if t.is_alive():
        # 处理超时 — 无法强杀线程（Python 限制）
        # 方案: 标记超时后依赖子进程隔离 or 用 multiprocessing.Process
        return {"status": "timeout", "error": f"Processing exceeded {timeout}s"}
    if exception:
        raise exception
    return result
```

> **注意**: Python `threading.Thread` 无法被强杀。更可靠的超时需要用 `multiprocessing.Process` + `Process.join(timeout)` + `Process.terminate()`。这也是推荐用 Process Pool 的原因之一。

### 心跳机制

```
Worker-1 ──(每 10s)──▶ Redis: SET worker:worker-1:heartbeat "alive" EX 30
Worker-2 ──(每 10s)──▶ Redis: SET worker:worker-2:heartbeat "alive" EX 30
                              │
                              ▼
                    API /health 检查心跳
                    任何 worker 超过 30s 无心跳 → 告警
```

**实现**：

```python
# celery_app.py — 后台心跳线程
def _heartbeat_loop():
    import redis
    r = redis.from_url(settings.redis_url)
    hostname = os.environ.get("HOSTNAME", "unknown")
    while True:
        try:
            r.setex(f"worker:{hostname}:heartbeat", 30, "alive")
        except Exception:
            pass
        time.sleep(10)

# worker_ready 时启动
@worker_ready.connect
def _on_worker_ready(sender, **kwargs):
    t = threading.Thread(target=_heartbeat_loop, daemon=True)
    t.start()
    # ... 现有的 metrics_collector_loop ...
```

**心跳指标**（新增 Prometheus Gauge）：

```python
WORKER_HEARTBEAT = Gauge("imagedb_worker_heartbeat_seconds", "Seconds since last heartbeat", ["worker"])
```

**告警规则**：

| 告警 | 表达式 | 阈值 |
|------|--------|------|
| Worker 心跳丢失 | `imagedb_worker_heartbeat_seconds > 30` | 持续 1m → Critical |
| Worker 心跳延迟 | `imagedb_worker_heartbeat_seconds > 15` | 持续 2m → Warning |

**Redis visibility timeout**（Celery 自带保障）：
- Celery `broker_transport_options.visibility_timeout` 默认 3600s
- 若 Worker 心跳丢失 + 任务未 ack → Redis 超时后重新投递任务
- 建议设为 300s（5 分钟，大于最大处理超时 2 分钟）

---

## 方案 C: 独立 Processing Service（长期方案）

### 架构

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  FastAPI     │────▶│  Redis           │────▶│  Processing     │
│  (upload)    │     │  (task queue)    │     │  Service        │
└─────────────┘     └──────────────────┘     │  (独立 FastAPI) │
                                              │  /process      │
                                              │  /status       │
                                              └────────┬────────┘
                                                       │
                                          ┌────────────┴────────────┐
                                          │                         │
                                    ┌─────┴─────┐           ┌─────┴─────┐
                                    │ Worker 1  │           │ Worker 2  │
                                    │ (Process) │           │ (Process) │
                                    └───────────┘           └───────────┘
```

**优点**:
- 独立扩缩容（可横向扩展 N 个容器）
- 流量控制（速率限制、队列深度管理）
- 健康检查独立
- 可独立重启不影�� API

**缺点**:
- 增加服务间网络调用延迟
- 需要服务发现（Docker DNS 足够）
- 运维复杂度增加

---

## 实施计划

### Phase 1: 修复 + 超时 + 心跳（明天）

1. 添加 `psycopg2-binary` 到 requirements.txt
2. 创建 `processing_sync.py`（同步 pipeline）
3. 修改 celery_app 为 solo pool + 心跳线程
4. docker-compose 部署两个 worker 容器
5. 实现三阶段超时（queue/wait/processing）+ 自动重试
6. 实现心跳机制（Redis heartbeat + Prometheus 指标）
7. 前端：多选功能（Phase 1: 多选删除）
8. 前端：上传成功 banner 自动消失（已在本次完成）

### Phase 2: 增强

1. 处理失败重试（max retries=1）
2. Worker 健康指标
3. 前端：批量操作（移动文件夹、批量标签）

### Phase 3: 未来

1. 独立 Processing Service（方案 C）
2. GPU 任务调度优化
3. 队列优先级

---

## 需同步修改的文件

| 文件 | 修改 |
|------|------|
| `backend/requirements.txt` | +psycopg2-binary |
| `backend/app/core/database.py` | +sync_engine, +sync_session |
| `backend/app/tasks/processing_sync.py` | 新建，300+ 行 |
| `backend/app/tasks/celery_app.py` | pool=solo |
| `docker-compose.yml` | worker-2 服务 |
| `monitoring/prometheus.yml` | worker-2 scrape target |
| `frontend/src/pages/UploadPage.tsx` | 多选删除 |
