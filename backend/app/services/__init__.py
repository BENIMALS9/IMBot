from app.core.config import get_settings

settings = get_settings()

if settings.vlm_provider == "qwen_api" and not settings.qwen_api_key:
    pass  # Will warn at startup
