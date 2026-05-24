# ImageDB

基于 AI 的个人智能相册管理系统。自动提取 EXIF 元数据、生成中文图片描述、智能分类、人脸识别，支持多维搜索和数据可视化。

## 系统架构

```
Browser (localhost:5173)
    │
    ▼
Frontend (Vite + React 18)  ←→  API (FastAPI)  ←→  PostgreSQL + pgvector
                                    │
                                    ├─ Worker (Celery)  ←→  Redis
                                    │   ├─ Qwen3-VL 8B (Ollama)  字幕 + 分类
                                    │   └─ InsightFace (ArcFace)  人脸检测 + 识别
                                    │
                                    └─ Storage (data/images/)
```

**6 个 Docker 容器**：postgres · redis · api · worker · frontend · ollama（可选）

## 核心功能

- **智能描述** — VLM 自动生成中文图片描述（≤80 字）
- **自动分类** — 根据图片内容匹配分类体系，支持手动修正
- **人脸识别** — 自动检测人脸，ArcFace 512 维向量匹配（pgvector）
- **EXIF 提取** — 时间、相机、镜头、GPS、ISO 等元数据
- **多维筛选** — 按分类、人物、日期、文件夹、关键词筛选
- **搜索补全** — 文件名、相机型号、人物、分类、热词实时提示
- **文件夹管理** — 树形结构，创建/重命名/删除，层级选择器

## 环境要求

| 组件 | 要求 |
|------|------|
| Docker | 24+ with Docker Compose |
| GPU（可选） | NVIDIA GPU + nvidia-container-toolkit（VLM 和人脸识别需要） |
| Ollama 模型 | `qwen3-vl:8b`（约 5GB，首次启动需拉取） |
| 磁盘 | 10GB+（取决于图片数量） |

## 快速启动

```bash
# 1. 配置环境
cp .env.example .env
# 编辑 .env：修改 JWT_SECRET，其余保持默认即可

# 2. 拉取 VLM 模型（如需 AI 功能）
docker compose up -d ollama
docker compose exec ollama ollama pull qwen3-vl:8b

# 3. 启动全部服务
docker compose up -d

# 4. 初始化数据库 + 种子数据
docker compose exec api python -m app.core.database

# 5. 访问
open http://localhost:5173
```

首次启动会自动创建表结构。注册账号后即可使用。

## 配置说明

`.env` 关键配置项：

```bash
# VLM 提供商：ollama（本地）/ qwen_api（云端）/ none（关闭）
VLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434/v1
OLLAMA_MODEL=qwen3-vl:8b

# AI 功能开关
ENABLE_VLM_CAPTION=true       # AI 描述生成
ENABLE_CLASSIFICATION=true    # 自动分类
ENABLE_FACE_RECOGNITION=true  # 人脸识别
```

无 GPU 环境：设置 `VLM_PROVIDER=none` 关闭 AI 功能，图片管理功能仍可正常使用。

## 使用指南

### 上传
1. 点击侧边栏「上传」→ 拖拽或选择图片文件
2. 选择目标文件夹，可选开启/关闭 AI 描述和人脸识别
3. 上传后 AI 自动处理，面板实时显示进度

### 浏览与筛选
- **全部图片**：瀑布流浏览，左侧按文件夹/分类/日期筛选
- **搜索**：输入关键词搜索，支持按范围筛选（文件名/人物/相机等），自动补全
- **图片详情**：查看 EXIF、AI 描述、分类，可手动添加/移除分类

### 人物管理
- **人物页面**：查看已识别人物，可重命名、合并重复人物
- 同一人出现多次会自动归并（阈值 0.55）

### 文件夹管理
- **文件夹页面**：创建树形文件夹结构，支持重命名、删除

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 · TypeScript · Vite · Tailwind CSS · shadcn/ui · TanStack Query |
| 后端 | FastAPI · SQLAlchemy 2.0 async · Pydantic v2 · Celery |
| 数据库 | PostgreSQL 16 + pgvector（向量索引） |
| 缓存队列 | Redis（Celery broker） |
| AI 模型 | Qwen3-VL 8B（Ollama）· InsightFace（SCRFD + ArcFace） |
| 分词 | jieba（中文关键词提取） |

## 项目结构

```
image_db/
├── docker-compose.yml
├── .env
├── backend/
│   ├── app/
│   │   ├── api/          # REST 路由
│   │   ├── models/       # ORM 模型
│   │   ├── schemas/      # Pydantic 模型
│   │   ├── services/     # VLM 提供商
│   │   ├── tasks/        # Celery 异步任务
│   │   └── core/         # 配置、数据库、安全
│   └── tests/
├── frontend/
│   └── src/
│       ├── pages/        # 页面组件
│       ├── components/   # 通用组件
│       └── lib/          # API 客户端
└── data/                 # 运行时数据（挂载卷）
    ├── images/
    ├── thumbnails/
    └── face_thumbnails/
```
