# ImageDB DEMO V1 — 架构·功能·拓扑

> 日期: 2026-05-24
> 状态: DEMO V1 完成，核心功能可用
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
       │ asyncpg              │ Celery task (Redis broker)
       ▼                      ▼
┌──────────────┐    ┌──────────────────────────────────────────────┐
│ PostgreSQL   │    │           Worker (Celery)                    │
│ + pgvector   │    │       Container: worker (GPU access)        │
│              │    │                                              │
│ Container:   │    │  concurrency=1 (VRAM management)             │
│ postgres     │    │  ┌────────────────────────────────────────┐ │
│ (port 5432)  │    │  │  process_new_image(image_id)           │ │
└──────┬───────┘    │  │  ├─ Step 1: VLM Caption + Classify     │ │
       │            │  │  │   Qwen3-VL 8B via Ollama            │ │
       │            │  │  └─ Step 2: Face Detection + Recogn.   │ │
       │            │  │       InsightFace (SCRFD + ArcFace)     │ │
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
│  Celery      │
│  broker +    │
│  result      │
│  backend     │
└──────────────┘
```

### 容器清单

| 容器 | 镜像 | 端口 | GPU | 用途 |
|------|------|------|-----|------|
| **postgres** | pgvector/pgvector:pg16 | 5432 | — | 主数据库 + 向量存储 |
| **redis** | redis:7-alpine | 6379 | — | Celery broker + result backend |
| **api** | built (backend) | 8000 | — | FastAPI REST API |
| **worker** | built (backend) | — | NVIDIA | Celery worker (AI pipeline) |
| **frontend** | built (frontend) | 5173 | — | Vite dev server |
| **ollama** | ollama/ollama:latest | 11434 | NVIDIA | Qwen3-VL 8B VLM 推理 |

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
- [x] **关键词分类**: 描述文字匹配预定义分类体系
- [x] **人脸检测**: InsightFace SCRFD 检测
- [x] **人脸识别**: ArcFace 512 维嵌入 + pgvector 余弦相似度匹配（阈值 0.55）
- [x] **新人自动创建**: 低于阈值的脸自动创建 Person 记录
- [x] **人脸缩略图**: 自动裁剪保存
- [x] **处理进度追踪**: ProcessingTask 表记录每步状态 + 时间戳
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
- [x] 关键词文本搜索
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
  └─ 4. 调用 process_new_image.delay(image_id)
         │
         ▼
    Celery Worker (concurrency=1)
         │
         ├─ Step 1: _async_caption_and_classify
         │    ├─ 更新 processing_status → "captioning"
         │    ├─ 创建 ProcessingTask (task_type="caption_and_classify", status="running")
         │    ├─ 调用 Ollama API: Qwen3-VL 8B → 中文描述 ≤100 字
         │    ├─ 关键词匹配分类体系
         │    ├─ 保存 caption_ai + ImageCategory 关联
         │    └─ 更新 ProcessingTask.status → "done"
         │
         └─ Step 2: _async_detect_faces
              ├─ 更新 processing_status → "faces"
              ├─ 创建 ProcessingTask (task_type="detect_faces", status="running")
              ├─ InsightFace SCRFD 检测人脸
              ├─ ArcFace 提取 512 维嵌入
              ├─ pgvector 余弦相似度匹配已知人物（阈值 0.55）
              │    ├─ 匹配成功 → 关联已有 Person
              │    └─ 匹配失败 → 创建新 Person (is_verified=False)
              ├─ 裁剪保存脸部缩略图
              └─ 更新 processing_status → "done"
```

### 4.2 关键技术问题与解决方案

| 问题 | 根因 | 解决方案 |
|------|------|---------|
| **Worker 启动报 Future attached to different loop** | Celery prefork 复制父进程 SQLAlchemy 引擎，连接池绑定到父进程事件循环 | `worker_process_init` 信号中调用 `engine.dispose()` 释放旧连接池 |
| **Qwen3-VL 返回空字符串** | 复杂结构化 prompt（要求 JSON 输出）导致模型无响应 | 简化 prompt 为 `"请用中文描述这张图片的内容，不超过100字。"`，分类改用关键词匹配 |
| **竖图缩略图旋转 90°** | Pillow `Image.open()` 不应用 EXIF 方向标签 | 使用 `ImageOps.exif_transpose()` 在缩略前校正方向 |
| **`/images/recent` 被 `/{image_id}` 拦截** | FastAPI 路由注册顺序：参数化路由先于静态路由 | 将 `/recent` 路由注册移到 `/{image_id}` 之前 |
| **GPU VRAM 管理** | 12GB 无法同时加载多个模型 | `concurrency=1` 串行执行，Ollama 独立容器按需加载 |

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
| `/upload` | UploadPage | 拖拽上传 + 上传历史（AI 状态实时刷新） |
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
| TODO-4 | 图像数据可视化（类别统计、人物统计、热词、知识图谱等） | 📋 待实现 |

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
