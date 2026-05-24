"""VLM Provider abstraction layer.

Supports:
- ollama: Local Qwen3-VL via Ollama (default, privacy-first)
- qwen_api: Cloud Qwen API via DashScope (higher quality, no local VRAM)
- none: Disable VLM captioning
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class VLMResponse:
    caption: str
    model_used: str
    provider: str


class VLMProvider(ABC):
    @abstractmethod
    async def describe_image(self, image_path: str, prompt: str | None = None) -> VLMResponse:
        ...


class OllamaProvider(VLMProvider):
    def __init__(self, base_url: str, model: str):
        self.base_url = base_url
        self.model = model

    async def describe_image(self, image_path: str, prompt: str | None = None) -> VLMResponse:
        import base64
        import httpx

        with open(image_path, "rb") as f:
            img_b64 = base64.b64encode(f.read()).decode()

        messages = [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
                {"type": "text", "text": prompt or "请用中文详细描述这张图片的内容，包括场景、主体、氛围和值得注意的细节。不超过200字。"},
            ],
        }]

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions",
                json={
                    "model": self.model,
                    "messages": messages,
                    "max_tokens": 500,
                    "temperature": 0.1,
                    "top_p": 0.9,
                },
            )
            data = resp.json()
            return VLMResponse(
                caption=data["choices"][0]["message"]["content"],
                model_used=self.model,
                provider="ollama",
            )


class QwenAPIProvider(VLMProvider):
    def __init__(self, api_key: str, base_url: str, model: str):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model

    async def describe_image(self, image_path: str, prompt: str | None = None) -> VLMResponse:
        import base64
        import httpx

        with open(image_path, "rb") as f:
            img_b64 = base64.b64encode(f.read()).decode()

        messages = [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
                {"type": "text", "text": prompt or "请用中文详细描述这张图片的内容，包括场景、主体、氛围和值得注意的细节。不超过200字。"},
            ],
        }]

        headers = {"Authorization": f"Bearer {self.api_key}"}
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions",
                json={"model": self.model, "messages": messages, "max_tokens": 500},
                headers=headers,
            )
            data = resp.json()
            return VLMResponse(
                caption=data["choices"][0]["message"]["content"],
                model_used=self.model,
                provider="qwen_api",
            )


def get_vlm_provider() -> VLMProvider | None:
    from app.core.config import get_settings
    s = get_settings()
    if s.vlm_provider == "ollama":
        return OllamaProvider(s.ollama_base_url, s.ollama_model)
    elif s.vlm_provider == "qwen_api":
        if not s.qwen_api_key:
            return None
        return QwenAPIProvider(s.qwen_api_key, s.qwen_api_base, s.qwen_model)
    return None
