# ImageDB DEMO V1 — 架构·功能·拓扑

> 最后更新: 2026-05-27
> 状态: DEMO V1 完成，核心功能可用，架构升级至 Plan C
>
> **仓库**: https://github.com/BENIMALS9/IMBot
> **硬件环境**: RTX 4070 SUPER (12GB VRAM)，Windows Docker Desktop (WSL2)
> **图片规模**: 千级~万级（个人使用）

---

## 1. 系统拓扑

```
┌──────────────────────────────────────────────────────────────────┐
│                       User Browser                               │
│                 http://localhost:5173                            │
└──────────────────────────┬───────────────────────────────────────┘
                           │ HTTP/REST
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Frontend (Vite + React 18)                     │
│                Container: frontend (port 5173)                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  shadcn/ui + Tailwind + TanStack Query + React Router       │ │
│  │  Pages: Dashboard | Gallery | Upload | Persons | Albums     │ │
│  │         Search | Settings | ImageDetail | PersonDetail      │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────────┘
                           │ /api/*
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    API (FastAPI + Uvicorn)                       │
│                Container: api (port 8000)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐      │
│  │  Auth    │ │  Images  │ │ Persons  │ │   Albums      │      │
│  │  (JWT)   │ │  Upload  │ │  Faces   │ │   CRUD        │      │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐      │
│  │ Folders  │ │Categories│ │  Search  │ │   Admin       │      │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘      │
│                                                                  │
│  SQLAlchemy 2.0 async + Pydantic v2 + exifread + Pillow         │
└──────┬──────────────────────┬────────────────────────────────────┘
       │                      │
       │ asyncpg              │ HTTP POST /process
       ▼                      ▼
┌──────────────┐    ┌──────────────────────────────────────────────┐
│ PostgreSQL   │    │     Processing Service (Plan C)              │
│ + pgvector   │    │     Container: processing (port 8002)       │
│              │    │     GPU access                               │
│ Container:   │    │                                              │
│ postgres     │    │  ThreadPoolExecutor (max_workers=1)          │
│ (port 5432)  │    │  ┌────────────────────────────────────────┐ │
└──────┬───────┘    │  │  process_image_sync(image_id)          │ │
       │            │  │  ├─ Step 1: VLM Caption + Classify     │ │
       │            │  │  │   Qwen3-VL 8B via Ollama            │ │
       │            │  │  ├─ Step 2: Face Detection + Recogn.   │ │
       │            │  │  │   InsightFace (SCRFD + ArcFace)     │ │
       │            │  │  └─ status: pending→processing→done    │ │
       │            │  └────────────────────────────────────────┘ │
       │            │                                              │
       │            │  ┌────────────────────────────────────────┐ │
       │            │  │         Ollama (optional)               │ │
       │            │  │     Container: ollama (port 11434)      │ │
       │            │  │     Model: qwen3-vl:8b                  │ │
       │            │  └────────────────────────────────────────┘ │
       │            └──────────────────────────────────────────────┘
       │
       ▼
┌──────────────┐
│    Redis     │
│  Container:  │
│  redis       │
│  (port 6379) │
│              │
│  (Celery     │
│   legacy     │
│   profile)   │
└──────────────┘
```

### 容器清单

| 容器 | 镜像 | 端口 | GPU | 用途 |
|------|------|------|-----|------|
| **postgres** | pgvector/pgvector:pg16 | 5432 | — | 主数据库 + 向量存储 |
| **redis** | redis:7-alpine | 6379 | — | 缓存（Celery legacy broker） |
| **api** | built (backend) | 8000 | — | FastAPI REST API |
| **processing** | built (backend) | 8002 | NVIDIA | Processing Service — AI 流水线 (Plan C) |
| **worker** | built (backend) | 8001 | NVIDIA | Celery worker (legacy profile, 已废弃) |
| **frontend** | built (frontend) | 5173 | — | Vite dev server |
| **ollama** | ollama/ollama:latest | 11434 | NVIDIA | Qwen3-VL 8B VLM 推理 |
| **prometheus** | prom/prometheus:latest | 9090 | — | 时序指标采集 (新增) |
| **grafana** | grafana/grafana:latest | 3000 | — | 监控可视化 (新增) |

---

## 2. 核心功能清单

### 2.1 用户系统
- [x] JWT 注册/登录/Token 刷新
- [x] 用户数据隔离（所有表 `user_id` 外键）
- [x] 用户资料编辑（用户名、邮箱、密码）
- [x] 用户头像上传/显示
- [x] 自动创建默认文件夹

### 2.2 图片管理
- [x] 批量拖拽上传 + 进度条
- [x] 文件夹/相册选择
- [x] EXIF 元数据提取（时间、相机、镜头、GPS、ISO 等）
- [x] 缩略图自动生成（400px，EXIF 方向校正）
- [x] 图片列表（分页、排序、多维度筛选）
- [x] 图片详情（EXIF 面板、AI 描述、分类、人物、标签）
- [x] 原图查看
- [x] 图片删除（含物理文件清理）
- [x] 图片备注编辑
- [x] 最近上传历史（20/30/50 张可选）

### 2.3 AI 处理流水线
- [x] **VLM 描述生成**: Qwen3-VL 8B 中文图片描述（≤100 字）
- [x] **VLM 描述 + 分类**: Qwen3-VL 8B 单次调用（"分类：" 分隔符合并输出），模型自行选出 1-3 个最佳分类，失败自动重试一次
- [x] **失败重试**: `/images/{id}/reprocess` 端点，超时/错误状态显示 + 前端重试按钮
- [x] **人脸检测**: InsightFace SCRFD 检测
- [x] **人脸识别**: ArcFace 512 维嵌入 + pgvector 余弦相似度匹配（阈值 0.55）
- [x] **新人自动创建**: 低于阈值的脸自动创建 Person 记录
- [x] **人脸缩略图**: 自动裁剪保存
- [x] **处理进度追踪**: ProcessingTask 表记录每步状态 + 时间戳（含 timeout/error 状态）
- [x] **实时状态轮询**: 前端 5 秒间隔刷新上传历史

### 2.4 人物管理
- [x] 已识别人物网格（头像、姓名、照片数）
- [x] 待标注人物分组
- [x] 人物重命名
- [x] 人物删除（含关联数据清理）
- [x] 人物详情页（分页展示关联图片）
- [x] 人物头像（脸部裁剪缩略图）

### 2.5 相册管理
- [x] 相册 CRUD
- [x] 添加/移除图片
- [x] 相册名称和描述编辑
- [x] 相册详情页（图片网格）

### 2.6 分类体系
- [x] 8 大类预定义分类体系（风景/人像/历史古迹/动物/美食/游戏/文档/其他）
- [x] 分类树 API
- [x] 自定义分类创建/删除
- [x] 种子分类一键初始化

### 2.7 搜索与筛选
- [x] 按分类筛选
- [x] 按人物筛选
- [x] 按文件夹筛选
- [x] 按日期范围筛选
- [x] 全文搜索（描述/文件名/地点/相机）
- [x] **搜索建议**: 随机 10 个分类 + 6 个热词（jieba 分词，纯中文，2-4 字）
- [x] **自动补全**: 200ms 防抖，5 种类型（文件名/人物/相机/分类/热词），彩色标签
- [x] **范围过滤**: 选择搜索范围后补全仅显示对应类型（SCOPE_TYPE_MAP）
- [x] URL 参数同步（可分享筛选链接）

### 2.8 系统管理
- [x] 系统状态 API（VLM 提供商、AI 功能开关状态）
- [x] 前端设置页面
- [x] 侧边栏导航 + 品牌 Logo

---

## 3. 数据库表结构

```
users ────────────── 用户表（含 avatar_path）
  │
  ├── folders ────── 文件夹（树形，含 image_count）
  │     │
  │     └── images ─ 图片（EXIF + AI 描述 + processing_status + clip_embedding）
  │           │
  │           ├── image_categories ── 图片-分类关联（置信度 + is_auto）
  │           │     └── categories ── 分类树（3 级，user_id 隔离）
  │           │
  │           ├── image_persons ───── 图片-人物关联（face_bbox + 置信度）
  │           │     └── persons ───── 人物（face_embedding 512 维 + face_thumbnail）
  │           │
  │           ├── image_tags ──────── 图片-标签关联
  │           │     └── tags ──────── 标签
  │           │
  │           ├── album_images ────── 相册-图片关联
  │           │     └── albums ────── 相册（含 smart_rules）
  │           │
  │           └── processing_tasks ── AI 处理记录（task_type + status + result + error）
  │
  └── (所有表均含 user_id 外键，ON DELETE CASCADE)
```

**关键索引**:
- `persons.face_embedding` — ivfflat 索引（vector_cosine_ops，lists=50）
- `images.clip_embedding` — ivfflat 索引（vector_cosine_ops，lists=100），预留字段
- `images.file_hash` — 去重查询
- 各表 `user_id` 索引 — 数据隔离查询

---

## 4. AI 处理流水线详解

### 4.1 触发流程

```
POST /api/images/upload
  │
  ├─ 1. 保存原图 + 生成缩略图（EXIF 方向校正）
  ├─ 2. 提取 EXIF 元数据
  ├─ 3. 写入 Image 记录（processing_status = "pending"）
  └─ 4. POST http://processing:8002/process → Processing Service (Plan C)
         │
         ▼
    Processing Service (ThreadPoolExecutor, max_workers=1)
         │
         ├─ status → "processing"
         │
         ├─ Step 1: VLM Caption + Classify
         │    ├─ 调用 Ollama API: Qwen3-VL 8B → 中文描述 ≤100 字 + "分类：" 分隔
         │    ├─ 模型自行选出 1-3 个最佳分类
         │    ├─ 保存 caption_ai + ImageCategory 关联
         │    └─ 失败自动重试一次
         │
         ├─ Step 2: Face Detection + Recognition
         │    ├─ InsightFace SCRFD 检测人脸
         │    ├─ ArcFace 提取 512 维嵌入
         │    ├─ pgvector 余弦相似度匹配已知人物（阈值 0.55）
         │    │    ├─ 匹配成功 → 关联已有 Person
         │    │    └─ 匹配失败 → 创建新 Person (is_verified=False)
         │    └─ 裁剪保存脸部缩略图
         │
         └─ status → "done" (或 "error" 异常时)
```

> **架构说明 (Plan C)**: Celery worker 已被 Processing Service 取代（`docker-compose.yml` 中 worker 标记为 `profiles: [legacy]`）。
> Processing Service 是独立的 FastAPI 应用（端口 8002），使用 `ThreadPoolExecutor(max_workers=1)` 串行执行 AI 任务，
> 通过同步 psycopg2 连接直接操作数据库，避免了 Celery + Redis 的复杂性和事件循环问题。

### 4.2 关键技术问题与解决方案

| 问题 | 根因 | 解决方案 |
|------|------|---------|
| **Worker 启动报 Future attached to different loop** | Celery prefork 复制父进程 SQLAlchemy 引擎，连接池绑定到父进程事件循环 | `worker_process_init` 信号中调用 `engine.dispose()` 释放旧连接池 |
| **Qwen3-VL 返回空字符串** | 复杂结构化 prompt（要求 JSON 输出）导致模型无响应 | 简化 prompt 为 `"请用中文描述这张图片的内容，不超过100字。"`，分类改用关键词匹配 |
| **竖图缩略图旋转 90°** | Pillow `Image.open()` 不应用 EXIF 方向标签 | 使用 `ImageOps.exif_transpose()` 在缩略前校正方向 |
| **`/images/recent` 被 `/{image_id}` 拦截** | FastAPI 路由注册顺序：参数化路由先于静态路由 | 将 `/recent` 路由注册移到 `/{image_id}` 之前 |
| **GPU VRAM 管理** | 12GB 无法同时加载多个模型 | `concurrency=1` 串行执行，Ollama 独立容器按需加载 |
| **Celery worker 退出不重来** | Celery + async SQLAlchemy 事件循环冲突，worker 僵死 | **Plan C**: Processing Service (FastAPI + ThreadPoolExecutor + sync psycopg2) 完全取代 Celery |
| **处理状态不准确** | 状态在任务入队时即设为 "processing"，实际排队中 | 将状态更新移入 `_worker()` 内部，仅在线程启动后更新 |

### 4.3 配置项（.env / Settings）

```python
# VLM 提供商切换
vlm_provider: "ollama" | "qwen_api" | "none"

# AI 功能开关
enable_classification: bool = True
enable_face_recognition: bool = True
enable_vlm_caption: bool = True

# Ollama
ollama_base_url: str = "http://ollama:11434/v1"
ollama_model: str = "qwen3-vl:8b"

# Qwen API (备选)
qwen_api_key: str = ""
qwen_model: str = "qwen-vl-max"
```

---

## 5. 前端页面路由

| 路径 | 页面 | 功能 |
|------|------|------|
| `/login` | LoginPage | 登录/注册 |
| `/` | DashboardPage | 统计概览 |
| `/gallery` | GalleryPage | 图片瀑布流 + 筛选（URL 参数同步） |
| `/images/:id` | ImageDetailPage | 图片详情 + EXIF + AI 数据 |
| `/upload` | UploadPage | 拖拽上传 + 上传历史（AI 状态实时刷新）+ 树形文件夹选择 |
| `/folders` | FoldersPage | 文件夹管理（树形创建/重命名/删除，递归展示） |
| `/persons` | PersonsPage | 人物网格（已识别 + 待标注） |
| `/persons/:id` | PersonDetailPage | 人物详情 + 关联图片 |
| `/albums` | AlbumsPage | 相册列表 |
| `/albums/:id` | AlbumDetailPage | 相册详情 + 图片管理 |
| `/search` | SearchPage | 综合搜索 |
| `/settings` | SettingsPage | 系统设置 |

### 5.1 设计系统

- **UI 框架**: shadcn/ui + Tailwind CSS
- **状态管理**: TanStack Query（服务端状态）+ React hooks（本地状态）
- **路由**: React Router v6（嵌套路由 + ProtectedRoute）
- **HTTP 客户端**: Axios（JWT 拦截器 + 401 自动跳转登录）
- **图标**: Lucide React

---

## 6. 目录结构

```
image_db/
├── .gitignore                       # 排除 .claude/、模型文件、人脸缩略图等
├── README.md                        # 项目说明
├── docker-compose.yml               # 6 容器编排
├── .env.example                     # 环境变量模板
├── docs/                            # 迭代记录文档
│   └── DEMO_V1.md                   # 本文档
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── migrations/
│   └── app/
│       ├── main.py                 # FastAPI 入口 + lifespan
│       ├── core/
│       │   ├── config.py           # Pydantic Settings
│       │   ├── database.py         # async engine + session + init_db
│       │   └── security.py         # JWT + bcrypt + get_current_user
│       ├── models/                 # SQLAlchemy ORM 模型
│       │   ├── user.py
│       │   ├── folder.py
│       │   ├── image.py            # 含 processing_status + clip_embedding
│       │   ├── category.py
│       │   ├── person.py           # 含 face_embedding (Vector 512)
│       │   ├── tag.py
│       │   ├── album.py
│       │   └── processing_task.py  # AI 处理追踪
│       ├── schemas/                # Pydantic 响应/请求模型
│       ├── api/                    # FastAPI 路由
│       │   ├── auth.py             # 注册/登录/资料/头像
│       │   ├── images.py           # 上传/列表/详情/删除/缩略图/原图
│       │   ├── folders.py
│       │   ├── categories.py
│       │   ├── persons.py          # 人物 CRUD + 人脸缩略图
│       │   ├── albums.py
│       │   ├── search.py
│       │   └── admin.py            # 状态查询/种子分类
│       ├── services/
│       │   └── vlm_provider.py     # VLM 抽象层 (Ollama / Qwen API)
│       └── tasks/
│           ├── celery_app.py       # Celery 配置 + worker_process_init
│           └── processing.py       # AI 流水线任务
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                 # 路由配置
│       ├── index.css
│       ├── lib/api.ts              # Axios 封装 + 所有 API 方法
│       ├── types/index.ts          # TypeScript 类型定义
│       ├── hooks/useAuth.ts        # 认证状态管理
│       ├── components/layout/
│       │   └── Layout.tsx          # 侧边栏 + Logo + 用户信息 + 头像
│       └── pages/
│           ├── LoginPage.tsx
│           ├── DashboardPage.tsx
│           ├── GalleryPage.tsx
│           ├── ImageDetailPage.tsx
│           ├── UploadPage.tsx
│           ├── PersonsPage.tsx
│           ├── PersonDetailPage.tsx
│           ├── AlbumsPage.tsx
│           ├── AlbumDetailPage.tsx
│           ├── SearchPage.tsx
│           └── SettingsPage.tsx
│
└── data/                           # 运行时数据（挂载卷）
    ├── images/                     # 原图存储
    ├── thumbnails/                 # 缩略图
    ├── face_thumbnails/            # 人脸裁剪
    └── insightface_models/         # InsightFace 模型文件
```

---

## 7. 已记录 TODO

| 编号 | 内容 | 状态 |
|------|------|------|
| TODO-1 | 上传时可选择是否开启 AI 描述和人脸识别（开关控件） | ✅ 已完成 |
| TODO-2 | 补充各功能模块的单元测试（可在本机 Docker 环境执行） | ✅ 已完成 |
| TODO-3 | 人物界面拖动头像合并重复人物（同一人识别为多个 Person） | ✅ 已完成 |
| TODO-4 | 图片批量多选操作（批量删除、批量合并人物） | ✅ 已完成 |
| TODO-5 | 图片浏览增强：左右切换、键盘导航、幻灯片播放（顺序/随机） | ✅ 已完成 |
| TODO-6 | 图片全屏灯箱模式（半透明掩模 + 悬浮控制栏 + 鼠标跟随显示） | ✅ 已完成 |
| TODO-7 | 图像数据可视化（类别统计、人物统计、热词、知识图谱等） | 📋 待实现 |
| TODO-8 | Prometheus + Grafana 系统指标监控（应用/流水线/基础设施） | 📋 待实现 |
| TODO-9 | 系统可靠性设计（健康检查/心跳/优雅降级/自动恢复/日志审计） | 📋 待实现 |

---

## 8. 待添加功能

### 8.1 人物关系图谱
根据图片中人物的同框次数等数据，自动构建人物关系知识图谱。
- **数据来源**: `image_persons` 表——同一张图片中出现的人物即为"同框"
- **关系强度**: 同框次数越多，关系连线越强
- **可视化**: D3.js / vis-network 力导向图，节点为人物头像，边为同框次数
- **交互**: 点击人物节点跳转人物详情，悬停连线查看共同照片数
- **后端**: 新增 `/api/persons/{id}/relations` 或 `/api/persons/graph` 端点

### 8.2 图片问答 Agent
基于 VLM 实现对话式图片内容问答，用户可用自然语言查询图片库。
- **技术路线**: Qwen3-VL 8B 多轮对话 + 图片检索上下文
- **场景示例**:
  - "找出去年在西湖拍的所有夕阳照片"
  - "这张照片里的人在做什么？"
  - "哪些照片里有猫和沙发？"
- **实现方式**: WebSocket 连接实现流式对话，Agent 可调用搜索 API 检索图片后回答

### 8.3 照片地图
基于 EXIF GPS 坐标在地图上展示照片分布。
- **数据来源**: `images.gps_latitude` / `images.gps_longitude`
- **地图库**: Leaflet.js / MapLibre GL（开源，无需 API Key）
- **功能**:
  - 地图聚合标记（Marker Clustering）
  - 点击标记弹出照片缩略图
  - 缩放/平移自动更新照片列表
  - 时间线联动（日期范围过滤）

### 8.4 图像数据可视化
在 Dashboard 页面提供多维度的数据可视化面板，帮助用户洞察图片库整体面貌。

#### 8.4.1 分类统计
- **数据来源**: `image_categories` + `categories` 表
- **展现形式**:
  - 分类树饼图（Treemap / Sunburst）：按一/二级分类展示图片数量占比
  - 分类柱状图：Top 10 分类及对应图片数
  - 未分类图片统计：提示用户补充分类
- **交互**: 点击分类区块跳转 Gallery 并自动筛选该分类

#### 8.4.2 人物统计
- **数据来源**: `image_persons` + `persons` 表
- **展现形式**:
  - 人物出镜频次排行（柱状图 + 头像缩略图）
  - 人物共现关系网络（力导向图），节点大小 = 出镜次数，边权重 = 同框次数
  - 待标注人物数量提醒

#### 8.4.3 热词 / 标签云
- **数据来源**: `images.caption_ai`（AI 描述文本分词）+ `tags` 表
- **展现形式**:
  - 词云（Word Cloud）：从 AI 描述中提取高频词（jieba 分词）
  - 标签频率排行
- **后端**: `/api/stats/keywords` — 返回 Top 50 高频词及权重
- **前端**: D3-cloud / echarts-wordcloud 渲染

#### 8.4.4 时间轴分析
- **数据来源**: `images.date_taken` / `images.created_at`
- **展现形式**:
  - 按年/月/日的照片数量热力图（类似 GitHub 贡献图）
  - 时间线滑块联动照片列表
  - 拍摄设备统计（相机型号占比饼图）

#### 8.4.5 知识图谱
- **数据来源**: 综合 `categories`、`persons`、`tags`、`captions`、GPS 等多维数据
- **展现形式**:
  - 实体-关系网络图：人物 ↔ 地点 ↔ 分类 ↔ 标签 之间的关联
  - 例如：张三 —[同框]→ 李四 —[地点]→ 西湖 —[分类]→ 风景
- **技术选型**: vis-network / G6 / D3-force
- **后端**: `/api/stats/graph` — 返回节点和边数据

#### 8.4.6 统计 API 设计
```
GET  /api/stats/overview        — 总览（图片总数、文件夹数、人物数、分类数、标签数）
GET  /api/stats/categories      — 分类统计（每个分类的图片数量，含树形结构）
GET  /api/stats/persons         — 人物统计（出镜频次、共现关系矩阵）
GET  /api/stats/keywords        — 热词统计（Top 50 高频词 + 权重）
GET  /api/stats/timeline        — 时间轴统计（按年/月/日聚合）
GET  /api/stats/graph           — 知识图谱（节点 + 边）
GET  /api/stats/devices         — 设备统计（相机型号、镜头）
```

### 8.5 系统监控（Prometheus + Grafana）
对 6 个容器及 AI 处理流水线进行全栈指标监控。

- **指标采集**: `prometheus_client`（Python）/ 内置 metrics endpoint
- **时序存储**: Prometheus（scrape `/metrics` 端点，15s 间隔）
- **可视化**: Grafana Dashboard（导入预配置 JSON）
- **告警**: Alertmanager 规则（可选，初期手动查看）

#### 8.5.1 应用层指标（FastAPI）
- **HTTP**: 请求总数、延迟分布（P50/P90/P99）、状态码计数（2xx/4xx/5xx）、活跃请求数
- **业务**: 图片上传速率、AI 处理速率、处理失败率、搜索查询速率

#### 8.5.2 AI 流水线指标（Celery Worker）
- **任务**: 任务执行时间（caption/classify/faces 分段）、任务状态计数（pending/running/done/timeout/error）、队列积压深度
- **VLM**: Ollama API 调用延迟、成功/超时/空响应比例
- **人脸**: 人脸检测数/图片、ArcFace 匹配耗时

#### 8.5.3 基础设施指标
- **PostgreSQL**: 连接池使用率、查询延迟、慢查询计数、pgvector 索引命中率
- **Redis**: 内存使用、连接数、Celery 队列长度
- **Docker 容器**: CPU、内存、磁盘使用（通过 `docker stats` 或 cAdvisor）

#### 8.5.4 Grafana Dashboard 布局
```
┌──────────────────────────────────────────────────────┐
│  ImageDB Overview                           [刷新]  │
├──────────┬──────────┬──────────┬─────────────────────┤
│ 总图片数 │ 今日上传 │ 处理中   │ 失败率             │
│ 1,234    │ 12       │ 3        │ 2.1%               │
├──────────┴──────────┴──────────┴─────────────────────┤
│  HTTP 延迟 (P50/P90/P99)         AI 处理速率         │
│  ┌──────────────────────┐  ┌──────────────────────┐ │
│  │ 折线图               │  │ 柱状图               │ │
│  └──────────────────────┘  └──────────────────────┘ │
├──────────────────────────────────────────────────────┤
│  容器资源 (CPU/MEM)                                   │
│  ┌──────────────────────────────────────────────────┐│
│  │ 堆叠面积图: api / worker / postgres / redis ...  ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

#### 8.5.5 容器编排
在 `docker-compose.yml` 中新增：
```yaml
prometheus:
  image: prom/prometheus:latest
  volumes:
    - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
  ports:
    - "9090:9090"

grafana:
  image: grafana/grafana:latest
  ports:
    - "3000:3000"
  volumes:
    - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards
```

### 8.6 系统可靠性设计
确保服务在异常情况下可自愈或优雅降级。

#### 8.6.1 健康检查与心跳
- **容器级**: 所有容器添加 Docker `healthcheck`（当前仅 postgres/redis 有）
  ```yaml
  api:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
  ```
- **应用级**: `/api/health` 端点返回各依赖状态
  ```json
  {
    "status": "ok",
    "checks": {
      "database": "ok",
      "redis": "ok",
      "ollama": "ok",
      "disk_usage": "72%"
    }
  }
  ```
- **心跳表**: DB 心跳记录（`heartbeat` 表），worker 定时写入，监控进程存活

#### 8.6.2 优雅降级
- **AI 服务不可用**: VLM/Face 失败不影响图片上传和浏览（processing_status = timeout/error，用户可手动重试）
- **数据库连接池耗尽**: 设置 `pool_size=20` + `max_overflow=10` + 连接超时 30s
- **Redis 不可用**: Celery 自动重连指数退避（当前默认已支持）

#### 8.6.3 自动恢复
- **Docker restart policy**: 所有容器 `restart: unless-stopped`（当前缺失，worker/ollama 崩溃不会自动重启）
- **Celery 任务重试**: `autoretry_for=(Exception,)` + `max_retries=3` + `retry_backoff=True`
- **数据库迁移**: 启动时自动 `alembic upgrade head`（在 `lifespan` 中执行）

#### 8.6.4 日志与审计
- **结构化日志**: JSON 格式日志 → ELK/Loki 采集（可选）
- **关键操作审计**: 图片删除、人物合并、分类修改记录操作日志
- **日志轮转**: `RotatingFileHandler` 或 Docker logging driver 限制日志大小

---

## 9. 已确认技术方向

**人脸数据库向量相似度匹配** — 用户提问："是不是可以弄一个人脸数据库，当有新的识别到的人脸，可以和数据库里的数据做向量积计算，有一个阈值，大于阈值就是不相关，就是新的人物，如果低于阈值就将该人脸识别成对应的人物"

**结论：当前技术路线正是此方案。**

- InsightFace ArcFace 生成 512 维人脸嵌入向量
- pgvector 存储向量，建立 ivfflat 余弦相似度索引
- 新人脸与数据库中所有已知人物逐一计算余弦相似度
- 阈值 0.55：高于阈值 → 匹配已知人物；低于阈值 → 自动创建新 Person
- 这与用户描述的 "CLIP 原理" 在思路上一致，只是用的是 ArcFace 嵌入而非 CLIP 嵌入（ArcFace 专为人脸优化，比 CLIP 在人脸识别任务上精度更高）

---

## 10. 工程基础设施（2026-05-24 更新）

### 10.1 版本控制
- **Git 仓库**: `git init` → commit → push
- **GitHub**: https://github.com/BENIMALS9/IMBot
- **GitHub 介绍**: work-in-progress vibe coding 练手图像管理系统

### 10.2 .gitignore 排除策略
确保敏感/大型/生成文件不上传：

| 类别 | 排除内容 |
|------|---------|
| **Claude** | `CLAUDE.md`、`.claude/`（技能框架、settings） |
| **设计文档** | `DESIGN_V1.md`（仅保留 `docs/` 内的迭代记录） |
| **运行时数据** | `data/images/`、`data/thumbnails/`、`data/face_thumbnails/` |
| **模型文件** | `data/insightface_models/`（~500MB ONNX 模型） |
| **环境配置** | `.env`、`.env.local` |
| **IDE/OS** | `.idea/`、`.vscode/`、`.DS_Store`、`Thumbs.db` |
| **依赖产物** | `node_modules/`、`dist/`、`__pycache__/`、`*.egg-info/` |
| **数据库** | `pgdata/`、`redis_data/`、`ollama_data/` |

### 10.3 文档目录 `docs/`
- `docs/DEMO_V1.md` — 当前迭代记录
- 后续每个 DEMO 版本在此目录下新建 `DEMO_V2.md`、`DEMO_V3.md`...（遵循工业标准：文档集中管理、版本化迭代记录）

---

## 11. 每日更新修复记录

### 2026-05-23（前一 session）

| 类型 | 描述 | 涉及文件 |
|------|------|---------|
| **Bug 修复** | 自动分类从未生效：`cat_map` 变量未定义导致 NameError，且关键词匹配方案根本无效 | `backend/app/tasks/processing.py` |
| **方案重构** | VLM 分类改为单次调用 + "分类：" 分隔符（JSON 结构化 prompt 导致 Qwen3-VL 返回空串） | `backend/app/tasks/processing.py` |
| **新功能** | 分类限制 Top 3（最高得分前三个分类标签） | `backend/app/tasks/processing.py` |
| **新功能** | 处理超时返回 timeout 状态 + 错误原因，前端重试按钮 | `backend/app/tasks/processing.py`、`backend/app/api/images.py`、`frontend/src/pages/ImageDetailPage.tsx` |
| **新功能** | 搜索建议重构：随机 10 分类 + 6 热词（jieba 分词，纯中文 2-4 字，去停用词） | `backend/app/api/search.py`、`backend/requirements.txt` |
| **新功能** | 搜索自动补全：200ms 防抖，5 种类型（文件名/人物/相机/分类/热词），彩色标签区分 | `frontend/src/pages/SearchPage.tsx`、`backend/app/api/search.py` |
| **新功能** | 范围过滤补全：选择范围后自动补全仅显示对应类型（SCOPE_TYPE_MAP） | `frontend/src/pages/SearchPage.tsx` |
| **新功能** | 文件夹管理页面：树形创建/重命名/删除，递归展示，层级缩进 | `frontend/src/pages/FoldersPage.tsx`、`frontend/src/lib/api.ts`、`frontend/src/App.tsx`、`frontend/src/components/layout/Layout.tsx` |
| **改进** | 上传页文件夹选择器显示树形层级（不间断空格 + `└` 缩进） | `frontend/src/pages/UploadPage.tsx` |
| **文档** | 新建 README.md（系统介绍、架构、启动方法、使用指南） | `README.md` |
| **文档** | DEMO_V1 新增 TODO-4（图像数据可视化）+ 8.4 节 6 个子功能设计 | `docs/DEMO_V1.md` |

### 2026-05-24

| 类型 | 描述 | 涉及文件 |
|------|------|---------|
| **工程** | `.gitignore` 完善：排除 `.claude/`、模型文件(~500MB)、人脸缩略图、`DESIGN_V1.md` | `.gitignore` |
| **工程** | `git init` → commit → push 至 GitHub | — |
| **工程** | 文档目录标准化：`docs/` 文件夹集中管理迭代记录 | `docs/DEMO_V1.md` |
| **文档** | DEMO_V1 补充：每日更新修复记录、搜索/分类/文件夹功能点更新、仓库信息 | `docs/DEMO_V1.md` |

### 2026-05-25

| 类型 | 描述 | 涉及文件 |
|------|------|---------|
| **架构升级** | **Plan C**: Processing Service (FastAPI port 8002) 取代 Celery worker，ThreadPoolExecutor 串行执行 AI 任务，同步 psycopg2 直连数据库 | `docker-compose.yml`、`backend/app/services/processing_server.py`、`backend/app/services/processing_pipeline.py` |
| **Bug 修复** | 处理状态显示修复：状态仅在 worker 线程实际启动时变为 "processing"，之前入队即变 "processing" | `backend/app/services/processing_server.py` |
| **工程** | Docker build pip 超时重试：`--default-timeout=300 --retries=5` + 清华镜像加速 | `backend/Dockerfile` |
| **新功能** | BrowseState 跨页图片浏览：所有列表页 Link 传递 imageIds/currentIndex/returnUrl，ImageDetailPage 内 prev/next 导航 | `frontend/src/types/index.ts`、`frontend/src/pages/ImageDetailPage.tsx`、GalleryPage/SearchPage/DashboardPage/PersonDetailPage/AlbumDetailPage |
| **新功能** | 键盘快捷键浏览：← → 上下张，Space 幻灯片播放，Esc/F 全屏切换 | `frontend/src/pages/ImageDetailPage.tsx` |
| **新功能** | 幻灯片播放：顺序/随机模式切换，预设速度(3/5/10/15s) + 自定义秒数输入 | `frontend/src/pages/ImageDetailPage.tsx` |
| **新功能** | 全屏灯箱模式：`fixed inset-0 z-50 bg-black/85 backdrop-blur-sm` 半透明掩模，图片悬浮居中，关闭按钮 + 序号指标 | `frontend/src/pages/ImageDetailPage.tsx` |
| **新功能** | 全屏悬浮控制栏：`bg-black/50 backdrop-blur` 圆角条，鼠标移动 3s 自动隐藏，`stopPropagation` 防止误退出 | `frontend/src/pages/ImageDetailPage.tsx` |
| **新功能** | TanStack Query prefetch 预加载相邻图片，浏览更流畅 | `frontend/src/pages/ImageDetailPage.tsx` |
| **Bug 修复** | 人物拖拽合并失效：`<img>` 元素浏览器默认 drag 行为拦截父级 `dragstart`，添加 `draggable={false}` 修复 | `frontend/src/pages/PersonsPage.tsx` |

### 2026-05-26

| 类型 | 描述 | 涉及文件 |
|------|------|---------|
| **新功能** | 图片库多选模式：批量删除，选中计数，全选本页/取消全选，蓝色勾选复选框 + 蓝色高亮边框 | `frontend/src/pages/GalleryPage.tsx` |
| **新功能** | 人物多选模式：悬浮弹窗（`bg-black/40 backdrop-blur-sm` 掩模），批量合并 + 批量删除，蓝色加粗边框标识选中 | `frontend/src/pages/PersonsPage.tsx` |
| **新功能** | 批量合并：选中 ≥2 个人物，第一个为目标，其余合并进去；合并/删除后不自动退出，用户手动关闭弹窗 | `frontend/src/pages/PersonsPage.tsx` |
| **Bug 修复** | 删除/合并人物时清理 `face_thumbnails/` 磁盘文件（之前仅删数据库记录，文件残留） | `backend/app/api/persons.py` |
| **改进** | 多选弹窗仅显示"已识别人物"，不显示"待标注"；背景页面冻结不联动 | `frontend/src/pages/PersonsPage.tsx` |
| **改进** | 多选样式：去除头像上圆形复选框，改为卡片直接显示 `ring-2 ring-blue-500` 蓝色加粗边框 | `frontend/src/pages/PersonsPage.tsx` |
