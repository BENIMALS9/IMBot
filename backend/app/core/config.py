from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "ImageDB"
    debug: bool = True

    # Database
    database_url: str = "postgresql+asyncpg://imagedb:imagedb@localhost:5432/imagedb"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24 hours

    # File Storage
    storage_path: str = "./data/images"
    thumbnail_path: str = "./data/thumbnails"
    max_upload_size_mb: int = 50

    # VLM Provider: "ollama" | "qwen_api" | "none"
    vlm_provider: str = "ollama"
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "qwen3-vl:8b"
    qwen_api_key: str = ""
    qwen_api_base: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    qwen_model: str = "qwen-vl-max"

    # AI Feature Flags
    enable_classification: bool = True
    enable_object_detection: bool = True
    enable_face_recognition: bool = True
    enable_vlm_caption: bool = True

    # CLIP Model
    clip_model: str = "ViT-L/14"

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
