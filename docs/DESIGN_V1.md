# ImageDB 设计文档 V1 — 迭代记录 #1

> 日期: 2026-05-23
> 状态: 已对齐，准备搭建框架
> 
> **硬件环境**: RTX 4070 SUPER (12GB VRAM)
> **图片规模**: 千级~万级（个人使用）
> **用户模式**: 单用户 + 登录系统，用户数据隔离

---

## 1. 项目目标

构建一个本地自托管的智能图片管理系统，核心能力：

1. **存储管理**: 以文件夹为单位上传和管理图片
2. **AI 自动分类**: 使用开源模型对图片进行多层次分类（大类 → 小类）
3. **人脸识别**: 识别并归类图片中的特定人物
4. **LLM 辅助描述**: 用视觉语言模型生成图片文字描述和解析
5. **多维筛选**: 按分类、时间、地点、人物等维度检索浏览
6. **Agent 集成（后续）**: 预留接口供 Agent 连接使用

---

## 2. 技术选型

### 2.1 总览架构

```
┌──────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│          React 18 + TypeScript + Vite + shadcn/ui            │
│                  + TanStack Query + Virtual                  │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTP/REST API
┌──────────────────────────▼───────────────────────────────────┐
│                     Backend (FastAPI)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │  Upload  │ │  Auth   │ │  Search  │ │Classification│  │
│  │  Module  │ │  Module │ │  Module  │ │    Pipeline   │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
│                     │                                        │
│          ┌──────────▼──────────┐                             │
│          │   Celery Workers    │                             │
│          │ (async processing)  │                             │
│          └──────────┬──────────┘                             │
└─────────────────────┼────────────────────────────────────────┘
                      │
    ┌─────────────────┼─────────────────┐
    ▼                 ▼                  ▼
┌───────┐    ┌──────────────┐    ┌──────────────┐
│Redis  │    │ PostgreSQL   │    │  AI Services │
│Cache  │    │ + pgvector   │    │ (vLLM/      │
│Queue  │    │ + pg_trgm    │    │  Ollama)    │
└───────┘    └──────────────┘    └──────────────┘
```

### 2.2 后端

| 组件 | 技术选择 | 理由 |
|------|---------|------|
| **Web 框架** | **FastAPI** (Python 3.12+) | 异步 I/O 适合图片上传/下载；Pydantic 类型安全；GPU 利用率比 Flask 高 30%；自动生成 API 文档 |
| **ORM** | **SQLAlchemy 2.0** (async) + Alembic | 成熟稳定，async 支持好，迁移管理完善 |
| **任务队列** | **Celery** + Redis broker | 图片处理（分类、识别、描述生成）需异步执行，避免阻塞 API |
| **认证** | JWT (python-jose) + bcrypt | 用户登录 + 数据隔离，下文详述 |

> **硬件约束**: RTX 4070 SUPER 12GB 显存。所有模型选型以此为上限，单卡串行运行（不同时加载多个大模型）。AI 流水线中各模型按需加载/卸载。
> 
> **对比参考**:
> - Django: 太重，admin panel 对此项目帮助有限
> - Litestar: 性能稍好但生态不如 FastAPI 成熟
> - Go (类似 PhotoPrism): 性能好但 ML 生态远不如 Python
> - **参照**: Immich 用 NestJS + FastAPI(ML层)，我们纯 Python 统一技术栈

### 2.3 数据库

| 组件 | 技术选择 | 用途 |
|------|---------|------|
| **主数据库** | **PostgreSQL 16** | 所有结构化数据、元数据 |
| **向量扩展** | **pgvector** | 存储图片 CLIP 嵌入 + 人脸嵌入，支持向量相似搜索 |
| **文本搜索** | **pg_trgm** | 模糊文本搜索、标签补全 |
| **缓存** | **Redis** | 会话缓存 + Celery broker + 热门查询缓存 |

**为什么不用 ElasticSearch?** — 当前阶段不需要，pgvector + pg_trgm 足够应对百万级图片的搜索需求。后续可加。

### 2.4 AI/ML 模型选型

#### 场景分类（大类自动分类）

| 方案 | 模型 | 优点 | 缺点 |
|------|------|------|------|
| **推荐** | **OpenAI CLIP** (ViT-L/14) 或 **OpenCLIP** | 零样本分类，自定义分类体系无需重训练；向量嵌入可用于相似图搜索 | 需要 GPU (2-4GB VRAM) |
| 备选 | ResNet-50 (TIMM) | CPU 可跑，速度快 | 只能分固定 1000 类，不灵活 |

**工作方式**: 预定义中文分类层次体系 → 用 CLIP 计算图片与每个类别描述的相似度 → 取最高分

#### 人脸检测与识别

| 方案 | 模型 | 优点 |
|------|------|------|
| **推荐** | **InsightFace** (ArcFace + SCRFD) | SOTA 精度，支持检测+嵌入+1:N识别，ONNX 导出 |
| 备选 | DeepFace (FaceNet512) | API 更简单，纯 Python，12+ 后端可切换 |

**工作方式**: 检测人脸 → 提取嵌入向量 → 存入 pgvector → 新的人脸自动匹配或提示标注

#### 物体检测：DINO vs YOLO 分析

> 用户提问：物体检测用 DINO 还是 YOLO 好？

**结论：选 YOLOv11。** 以下是详细分析。

| 维度 | DINO-DETR / DEIMv2 系列 | YOLOv11 系列 |
|------|------------------------|--------------|
| **架构** | Transformer 端到端，无需 NMS | CNN 单阶段，anchor-free |
| **精度 (COCO mAP)** | DEIMv2-X: **57.8** (SOTA) | YOLOv11x: 54.7 |
| **推理速度** | DEIMv2-S: ~90 FPS (4090) | YOLOv11n: **300+** FPS (4090) |
| **显存占用** | DEIMv2-L: ~3-4 GB | YOLOv11m: ~1-2 GB |
| **部署成熟度** | 较新，生态建设中 | **极其成熟**，Ultralytics 一站式 |
| **小模型精度** | DEIMv2-S (10M): 50.9 mAP | YOLOv11s (9M): 48.5 mAP |
| **开放词汇检测** | Grounding DINO 2 支持 | YOLO-World v3 支持 |
| **易用性** | 需要 Transformers 库配置 | `pip install ultralytics` 一行 |

**对本项目的适用性分析：**

| 因素 | 对本项目的影响 | 胜出 |
|------|---------------|------|
| **精度需求** | 辅助分类，非关键路径。检测出"有车、有建筑"帮助 CLIP 判断"城市天际线"vs"自然景观" | 两者都够用 |
| **速度需求** | 离线批处理，非实时。万张图分批跑完即可 | 两者都 OK |
| **12GB 显存** | 需要和其他模型串行共用（CLIP → YOLO → VLM） | YOLO 更省显存 |
| **维护成本** | 个人项目，时间有限 | **YOLO 碾压**（Ultralytics 生态） |
| **中文物体名** | 需要识别后映射中文名称 | YOLO 默认 COCO 80类英文，需映射 |

> **2026 年趋势**: DETR 系列（DEIMv2 + DINOv3 backbone）在精度上已全面超越 YOLO，但 YOLO 在**部署便利性、速度、生态**上仍然碾压。对本项目而言，物体检测只是辅助环节，YOLOv11 完全够用。后续若需要开放词汇检测（如"检测图片中的宝塔"），可切到 Grounding DINO 2 或 YOLO-World v3。

**选择: [YOLOv11m](https://github.com/ultralytics/ultralytics)** — 精度与显存的甜点（<2GB VRAM），Ultralytics 一键部署。

---

#### 图片描述生成（VLM）

> **硬件约束**: RTX 4070 SUPER **12GB** 显存，Qwen3-VL 8B FP16 需 ~17GB，无法直接使用。需量化或降级。

| 方案 | 模型 | 显存占用 | 可用性 |
|------|------|---------|--------|
| **推荐** | **Qwen3-VL-8B Q4_K_M** (GGUF) | ~6-8 GB | 12GB 内最佳中文 VLM |
| 推荐 | **Qwen3-VL-4B Q5_K_M** (GGUF) | ~5 GB | 轻量，中文推理强 |
| 备选 | **InternVL3-8B INT8** (AWQ) | ~10 GB | OCR/文档最强，但逼近上限 |
| 备选 | **llava:7b** / **minicpm-v** (Ollama) | ~5-8 GB | 部署最简单 |

**方案对比**:

| 方案 | 模型 | 显存占用 | 优点 | 缺点 |
|------|------|---------|------|------|
| **推荐: Ollama 本地** | Qwen3-VL-8B Q4_K_M | ~6-8 GB | 完全离线，隐私安全，无 API 费用 | 量化有精度损失，占本地显存 |
| **备选: Qwen API** | Qwen3-VL-8B (FP16 云端) | **0 GB 本地** | 不占显存，FP16 全精度，零部署 | 需联网，有 API 费用，隐私数据上传 |

**选择: Ollama 本地为主 + Qwen API 可选切换**

- 默认用 Ollama 本地 Qwen3-VL-8B Q4_K_M，隐私优先、零成本
- 同时预留 Qwen API (DashScope) 接口作为可选配置：不想占本地显存、追求最高精度描述时切换
- 两者 API 格式不同但后端统一封装 `VLMProvider` 接口，设置页面一键切换

**Qwen API (DashScope)**:
- 端点: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- 模型: `qwen-vl-max` / `qwen-vl-plus`
- 费用: 按 token 计费，图片描述场景成本很低（~0.001-0.003 元/图）
- 优势: 不占 12GB 显存，本地可以同时跑 CLIP + YOLO + InsightFace，VLM 交给云端

> **运行时策略**: Celery Worker 串行加载模型，避免多个大模型同时占显存：
> 1. CLIP (2GB) → 分类完成 → 卸载
> 2. YOLO (2GB) → 检测完成 → 卸载
> 3. InsightFace (1GB) → 人脸完成 → 卸载
> 4. Qwen3-VL (8GB) → 描述生成 → 卸载
> 
> 峰值显存 ~8GB，留 4GB 余量给 KV cache 和系统。

### 2.5 前端

| 组件 | 技术选择 | 理由 |
|------|---------|------|
| **框架** | **React 18** + TypeScript | 生态最丰富，社区活跃 |
| **构建工具** | **Vite** | 比 Webpack 快 10x+ |
| **UI 组件库** | **shadcn/ui** + Tailwind CSS | 高质量、可定制、暗色模式内置 |
| **图片画廊** | **react-photo-album** | 响应式瀑布流，SSR 友好，轻量 |
| **虚拟滚动** | **@tanstack/react-virtual** | 万级图片流畅滚动 |
| **服务端状态** | **TanStack Query** | 缓存、自动刷新、乐观更新 |
| **客户端状态** | **Zustand** | 轻量，比 Redux 简洁 |
| **文件上传** | **Uppy** | 分片上传、拖拽、进度条、文件夹选择 |

### 2.6 基础设施

| 组件 | 技术选择 |
|------|---------|
| **部署** | Docker Compose (api + worker + postgres + redis + ollama) |
| **文件存储** | 本地文件系统 + 结构化目录 (后续可切 MinIO) |
| **图片处理** | Pillow + python-magic (缩略图生成、格式转换) |
| **EXIF 提取** | exifread / Pillow EXIF |

---

## 3. 数据库表设计

### 3.1 核心表

```sql
-- ==================== 用户系统 ====================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(100) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    email           VARCHAR(255),
    is_active       BOOLEAN DEFAULT TRUE,
    is_admin        BOOLEAN DEFAULT FALSE,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 用户数据隔离：所有核心表加 user_id 外键
-- folders, images, categories, tags, albums, persons 均关联 user_id

-- ==================== 文件夹/相册 ====================

-- folders: 上传的文件夹（物理分组）
CREATE TABLE folders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(500) NOT NULL,
    description     TEXT,
    parent_id       UUID REFERENCES folders(id) ON DELETE CASCADE,
    cover_image_id  UUID,  -- references images(id) later
    image_count     INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_folders_user ON folders(user_id);
CREATE INDEX idx_folders_parent ON folders(parent_id);

-- ==================== 图片 ====================

CREATE TABLE images (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id       UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    
    -- 文件信息
    filename        VARCHAR(500) NOT NULL,
    original_name   VARCHAR(500),
    file_path       VARCHAR(1000) NOT NULL,
    thumbnail_path  VARCHAR(1000),
    file_size       BIGINT,
    width           INTEGER,
    height          INTEGER,
    mime_type       VARCHAR(100),
    file_hash       VARCHAR(64),  -- SHA-256 for dedup
    
    -- EXIF / 元数据
    date_taken      TIMESTAMPTZ,
    camera_model    VARCHAR(200),
    lens_model      VARCHAR(200),
    focal_length    VARCHAR(50),
    aperture        VARCHAR(50),
    shutter_speed   VARCHAR(50),
    iso             INTEGER,
    gps_latitude    DOUBLE PRECISION,
    gps_longitude   DOUBLE PRECISION,
    gps_altitude    DOUBLE PRECISION,
    location_name   VARCHAR(500),  -- reverse geocode result
    exif_raw        JSONB,
    
    -- AI 生成
    clip_embedding  vector(768),   -- CLIP ViT-L/14 = 768 dims
    caption_ai      TEXT,          -- VLM auto-generated caption
    
    -- 用户输入
    user_notes      TEXT,          -- user manual notes
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_images_user ON images(user_id);
CREATE INDEX idx_images_folder ON images(folder_id);
CREATE INDEX idx_images_date_taken ON images(date_taken);
CREATE INDEX idx_images_location ON images(gps_latitude, gps_longitude);
CREATE INDEX idx_images_file_hash ON images(file_hash);
CREATE INDEX idx_images_clip_embedding ON images USING ivfflat (clip_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_images_gin_exif ON images USING GIN (exif_raw);

-- ==================== 分类体系 ====================

CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    slug            VARCHAR(200) NOT NULL,
    description     TEXT,
    parent_id       UUID REFERENCES categories(id) ON DELETE CASCADE,
    level           INTEGER NOT NULL DEFAULT 1,  -- 1=大类, 2=中类, 3=小类
    sort_order      INTEGER DEFAULT 0,
    icon            VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, slug)
);

-- 图片-分类 多对多 (带置信度)
CREATE TABLE image_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id        UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    category_id     UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    confidence      FLOAT NOT NULL DEFAULT 0.0,
    is_auto         BOOLEAN DEFAULT TRUE,  -- true=AI分类, false=人工修正
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(image_id, category_id)
);
CREATE INDEX idx_image_categories_image ON image_categories(image_id);
CREATE INDEX idx_image_categories_category ON image_categories(category_id);

-- ==================== 人物识别 ====================

CREATE TABLE persons (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(200),
    slug            VARCHAR(200),
    face_embedding  vector(512),   -- ArcFace = 512 dims
    face_thumbnail  VARCHAR(1000), -- path to face crop
    image_count     INTEGER DEFAULT 0,
    is_verified     BOOLEAN DEFAULT FALSE,  -- user confirmed identity
    -- 隐私控制
    is_encrypted    BOOLEAN DEFAULT FALSE,  -- face embedding encrypted at rest
    is_hidden       BOOLEAN DEFAULT FALSE,  -- user manually hides this person
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, slug)
);
CREATE INDEX idx_persons_user ON persons(user_id);
CREATE INDEX idx_persons_embedding ON persons USING ivfflat (face_embedding vector_cosine_ops) WITH (lists = 50);

CREATE TABLE image_persons (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id        UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    person_id       UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    face_bbox       JSONB,  -- {x, y, width, height}
    confidence      FLOAT NOT NULL DEFAULT 0.0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(image_id, person_id)
);
CREATE INDEX idx_image_persons_image ON image_persons(image_id);
CREATE INDEX idx_image_persons_person ON image_persons(person_id);

-- ==================== 标签系统 ====================

CREATE TABLE tags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) NOT NULL,
    color           VARCHAR(7),   -- hex color
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, slug)
);
CREATE INDEX idx_tags_user ON tags(user_id);

CREATE TABLE image_tags (
    image_id        UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    tag_id          UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (image_id, tag_id)
);

-- ==================== 用户相册（虚拟分组，不同于文件夹） ====================

CREATE TABLE albums (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(500) NOT NULL,
    description     TEXT,
    cover_image_id  UUID REFERENCES images(id) ON DELETE SET NULL,
    is_smart        BOOLEAN DEFAULT FALSE,  -- smart album based on rules
    smart_rules     JSONB,  -- rule definition for smart albums
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_albums_user ON albums(user_id);

CREATE TABLE album_images (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id        UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    image_id        UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    sort_order      INTEGER DEFAULT 0,
    added_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(album_id, image_id)
);

-- ==================== AI 处理记录 ====================

CREATE TABLE processing_tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id        UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    task_type       VARCHAR(50) NOT NULL,  -- classification, face_detection, caption, embedding
    status          VARCHAR(20) DEFAULT 'pending',  -- pending, running, completed, failed
    model_name      VARCHAR(200),
    result          JSONB,
    error_message   TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_processing_tasks_image ON processing_tasks(image_id);
CREATE INDEX idx_processing_tasks_status ON processing_tasks(status);
```

### 3.2 预定义分类体系（示例）

```
📁 风景 (landscape)
  ├── 🌄 自然景观 (natural)
  │   ├── 山脉
  │   ├── 湖泊/河流
  │   ├── 海洋/海滩
  │   ├── 森林
  │   ├── 草原/沙漠
  │   ├── 天空 (日出/日落/星空)
  │   └── 花卉/植物
  └── 🏛️ 人文景观 (cultural)
      ├── 城市天际线
      ├── 建筑/地标
      ├── 街道/巷弄
      ├── 桥梁
      └── 园林/公园

📁 人像 (portrait)
  ├── 👤 单人
  ├── 👥 多人/合影
  └── 🎭 艺术人像

📁 历史古迹 (historical)
  ├── 🏛️ 中国古迹
  ├── 🏰 世界古迹
  └── 🗿 文化遗产

📁 动物 (animals)
  ├── 🐱 猫
  ├── 🐶 狗
  ├── 🐦 鸟类
  ├── 🐟 水生动物
  └── 🦁 野生动物

📁 美食 (food)
  ├── 🍜 中餐
  ├── 🍕 西餐
  └── 🍰 甜品

📁 游戏 (gaming)
  ├── 🎮 游戏截图
  ├── 🎨 游戏原画/概念图
  └── 🕹️ 游戏设备/外设

📁 文档/截图 (documents)
  ├── 📄 文档
  ├── 📱 截图
  └── 🧾 票据/收据

📁 其他 (other)
```

---

## 4. AI 处理流水线

```
新图片上传
    │
    ▼
[1] EXIF 提取 ──── 提取拍摄时间、相机参数、GPS
    │
    ▼
[2] 缩略图生成 ─── 多尺寸缩略图 (200px, 800px)
    │
    ▼
[3] CLIP 嵌入 ───── 生成 768维向量，存入 pgvector
    │
    ▼
[4] 场景分类 ──── CLIP 零样本分类 → 匹配预定义分类树
    │
    ▼
[5] 物体检测 ──── YOLO 检测物体，辅助分类决策
    │
    ▼
[6] 人脸检测 ──── InsightFace 检测人脸 → 提取嵌入
    │                │
    │                ├── 匹配已知人物 (pgvector 向量搜索)
    │                └── 未匹配 → 自动创建 Unknown Person，提示用户标注
    │
    ▼
[7] VLM 描述 ──── Qwen3-VL / LLaVA 生成图片文字描述
    │
    ▼
[8] 完成 ──────── 更新 processing_tasks 状态
```

所有步骤在 Celery Worker 中异步执行，支持并行处理多张图片。

---

## 5. API 设计概要

### 5.0 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/auth/register` | 注册（首次使用，仅管理员可邀请后续用户） |
| `POST` | `/api/auth/login` | 登录，返回 JWT token |
| `POST` | `/api/auth/logout` | 退出 |
| `GET` | `/api/auth/me` | 获取当前用户信息 |

### 5.1 文件夹管理
| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/folders` | 列出所有文件夹（树形） |
| `POST` | `/api/folders` | 创建文件夹 |
| `GET` | `/api/folders/{id}` | 获取文件夹详情 |
| `PUT` | `/api/folders/{id}` | 更新文件夹信息 |
| `DELETE` | `/api/folders/{id}` | 删除文件夹及其中图片 |

### 5.2 图片上传与管理
| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/images/upload` | 上传图片（支持批量、文件夹） |
| `GET` | `/api/images` | 列出图片（支持筛选、排序、分页） |
| `GET` | `/api/images/{id}` | 获取图片详情 |
| `GET` | `/api/images/{id}/thumbnail` | 获取缩略图 |
| `GET` | `/api/images/{id}/original` | 获取原图 |
| `PUT` | `/api/images/{id}` | 更新图片元数据/用户备注 |
| `DELETE` | `/api/images/{id}` | 删除图片 |
| `POST` | `/api/images/batch` | 批量操作（分类、标签、删除） |

### 5.3 搜索与筛选
| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/search` | 综合搜索 |
| 参数 | `?q=关键词` | 文本搜索 |
| 参数 | `&category=slug` | 按分类筛选 |
| 参数 | `&person=person_id` | 按人物筛选 |
| 参数 | `&date_from=&date_to=` | 按时间范围 |
| 参数 | `&lat=&lng=&radius=` | 按位置筛选 |
| 参数 | `&tag=tag_slug` | 按标签筛选 |
| 参数 | `&similar_to=image_id` | 相似图片搜索（以图搜图） |
| 参数 | `&sort=date_taken\|created\|random` | 排序方式 |

### 5.4 分类管理
| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/categories` | 获取分类树 |
| `POST` | `/api/categories` | 创建自定义分类 |
| `PUT` | `/api/categories/{id}` | 更新分类 |
| `DELETE` | `/api/categories/{id}` | 删除分类 |

### 5.5 人物管理
| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/persons` | 列出所有人物 |
| `GET` | `/api/persons/{id}` | 获取人物详情及关联图片 |
| `PUT` | `/api/persons/{id}` | 更新人物姓名/合并人物 |
| `GET` | `/api/persons/unknown` | 列出未标注的未知人物 |

### 5.6 AI 处理
| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/process/{image_id}` | 触发单张图片重新处理 |
| `POST` | `/api/process/batch` | 批量重新处理 |
| `GET` | `/api/process/status` | 获取处理队列状态 |

### 5.7 相册管理
| 方法 | 路径 | 说明 |
|------|------|------|
| `GET/POST` | `/api/albums` | 列出/创建相册 |
| `GET/PUT/DELETE` | `/api/albums/{id}` | 相册 CRUD |
| `POST` | `/api/albums/{id}/images` | 添加图片到相册 |
| `DELETE` | `/api/albums/{id}/images/{image_id}` | 移除图片 |

---

## 6. 前端页面与交互

### 6.1 页面结构

```
┌─────────────────────────────────────────┐
│  Sidebar                    │  Main     │
│  ─────────────────           │  Content  │
│  📊 仪表盘                   │           │
│  📁 文件夹                   │           │
│  🖼️ 全部图片                 │           │
│  👤 人物                     │           │
│  📂 相册                     │           │
│  🏷️ 标签管理                 │           │
│  🔍 搜索                     │           │
│  ⚙️ 设置                     │           │
│  ─────────────────           │           │
│  🚪 退出登录                 │           │
└─────────────────────────────────────────┘

登录页: 用户名 + 密码 → JWT Token (存储在 HttpOnly cookie)
初次使用: 注册管理员账户 → 自动创建默认分类体系
```

### 6.2 各页面交互功能

**仪表盘**
- 图片总数、文件夹数、人物数统计卡片
- 最近上传的图片缩略图预览
- 分类分布饼图/柱状图
- 处理队列状态指示

**图片库（瀑布流）**
- 响应式瀑布流布局（2-5列自适应宽度）
- 虚拟滚动，流畅加载万级图片
- 悬停显示：分类标签、人物标记、AI描述摘要
- 多选模式：Shift+点击范围选择，批量操作工具栏
- 右键菜单：分类、标签、加入相册、删除
- 排序切换：时间线 / 随机 / 按分类分组

**筛选面板（侧边或弹出）**
- 分类树（多选，复选框）
- 日期范围选择器 → 时间线滑块
- 人物选择（头像列表，多选）
- 地点（地图视图，按 GPS 聚类）
- 标签（多选 chips）
- 已选筛选条件实时预览
- 保存当前筛选为智能相册

**图片详情（灯箱/全屏）**
- 高清大图 + 缩放/拖拽
- 信息面板：
  - 文件名、大小、分辨率、日期
  - EXIF 数据（相机、镜头、参数）
  - GPS 位置（嵌入地图片段）
  - AI 分类结果（带置信度，可手动修正）
  - AI 描述文字
  - 用户备注（富文本编辑）
  - 检测到的人物（人脸框标注，点击跳转）
  - 标签列表（可编辑）
- 左右箭头切换上一张/下一张
- 相似图片推荐

**上传页面**
- 拖拽文件夹 / 多文件到上传区域
- 上传前预览缩略图列表
- 选择/创建目标文件夹
- 批量添加初始标签、备注
- 上传进度条（单文件 + 总体）
- 上传完成后自动触发 AI 处理
- 处理进度实时展示

**人物浏览**
- 人物头像网格
- 点击进入该人物的所有图片
- 未标注人物分组（按脸部聚类）
- 标注/重命名人物
- 合并重复人物

**相册管理**
- 相册列表（名称、封面、图片数）
- 创建相册、编辑名称/描述
- 拖拽图片到相册（或批量添加）
- 智能相册：基于规则自动收集（如 "2025年的所有风景照"）

**搜索**
- 搜索框（支持关键词、自然语言）
- 语义搜索："夕阳下的海滩"
- 以图搜图：上传图片查找相似
- 搜索结果高亮展示

**设置**
- AI 模型配置（选择 CLIP 模型、VLM 模型、YOLO 模型）
- 处理设置（是否自动分类、物体检测开关）
- **人脸隐私设置**：
  - 启用人脸识别（全局开关，关闭后不检测新人脸，已有的隐藏）
  - 查看/管理已识别的人物
  - 清除所有人脸数据（不影响原始图片）
- 分类体系自定义（添加/编辑分类）
- 存储路径配置
- 系统状态（数据库大小、处理队列）

---

## 7. 后续迭代规划

### V2 — Agent 集成
- 开放 WebSocket 接口
- Agent 可通过 API 查询图片库、执行分类操作
- 对话式图片检索（"找去年在西湖拍的所有夕阳照片"）

### V3 — 高级功能
- 图片去重（基于 hash + 视觉相似度）
- 自动备份/同步
- 多用户支持 + 权限管理
- 分享链接生成

### V4 — 移动端
- React Native 或 PWA 移动端
- 手机照片自动同步

---

## 8. 人脸隐私设计方案

### 设计原则
人脸数据属于敏感个人信息，需要给用户完整的控制权。

### 方案：本地存储 + 可选加密 + 用户控制面板

| 控制项 | 实现方式 |
|--------|---------|
| **本地优先** | 所有人脸数据（嵌入向量、缩略图）仅存本地 PostgreSQL，不外传任何云端服务 |
| **可选加密** | `persons.face_embedding` 可用 AES-256-GCM 加密存储。用户首次开启时设置独立密钥（不同于登录密码），加密后 pgvector 无法直接索引，需运行时解密到内存 |
| **全局开关** | 设置页面提供"启用人脸识别"开关。关闭后：停止新人脸检测、已存人脸数据标记隐藏、API 不再返回人物相关数据 |
| **按人管理** | `persons.is_hidden` 字段：可手动隐藏特定人物，此人的所有关联在界面中不可见 |
| **数据清除** | 支持一键删除全部人脸数据（persons + image_persons + face_embeddings），不影响原始图片 |
| **缩略图裁剪** | `persons.face_thumbnail` 只存脸部裁剪区域（通常 112×112），不存完整人脸照片 |

> **V1 实现策略**: 先做明文存储 + 全局开关 + 按人隐藏，加密存储放到 V2（加密后 pgvector 无法索引，需全表扫描或应用层向量搜索，复杂度高）。

---

## 9. 本次对齐结论

| 问题 | 结论 |
|------|------|
| **GPU** | RTX 4070 SUPER 12GB — 模型需量化，串行加载 |
| **图片规模** | 千级~万级，个人使用 |
| **用户系统** | JWT 登录 + 所有数据表 `user_id` 隔离 |
| **分类体系** | 7 大类（风景/人像/历史古迹/动物/美食/游戏/文档）+ 其他，支持自定义扩展 |
| **物体检测** | YOLOv11 — 精度够用、部署最简、显存友好 |
| **人脸隐私** | V1: 本地存储 + 全局开关 + 按人隐藏；V2: 加密 |
| **图片描述 VLM** | Qwen3-VL-8B Q4_K_M via Ollama，12GB 最佳选择 |
| **存储路径** | 可配置，默认 `./data/images/` |

---

## 10. 技术选型对比总结（终版）

| 层级 | 选择 | 主要备选 | 选择理由 |
|------|------|---------|---------|
| 后端框架 | **FastAPI** | Django, Litestar | 异步图片处理 + ML 集成最优 |
| 数据库 | **PostgreSQL + pgvector** | MariaDB | 向量搜索原生支持 |
| 场景分类 | **CLIP ViT-L/14** | ResNet | 零样本自定义中文分类 |
| 人脸识别 | **InsightFace (ArcFace)** | DeepFace | SOTA 精度，ONNX 导出，1:N 匹配 |
| 物体检测 | **YOLOv11m** | DEIMv2/RT-DETR | 部署最简，<2GB 显存，精度够用 |
| 图片描述 | **Qwen3-VL-8B Q4_K_M** (Ollama) | InternVL3/llava | 12GB 内最佳中文 VLM |
| 前端框架 | **React + shadcn/ui** | Vue, Svelte | 生态最大，组件最丰富 |
| 部署 | **Docker Compose** | K8s | 初期 5 容器，简单够用 |

