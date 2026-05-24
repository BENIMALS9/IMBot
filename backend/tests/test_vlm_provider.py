"""Tests for VLM provider module."""

import os
from unittest.mock import MagicMock, patch, mock_open

import pytest


class TestVLMProviderFactory:
    def test_get_provider_ollama(self):
        with patch("app.core.config.get_settings") as mock_settings:
            settings = MagicMock()
            settings.vlm_provider = "ollama"
            settings.ollama_base_url = "http://localhost:11434/v1"
            settings.ollama_model = "qwen3-vl:8b"
            mock_settings.return_value = settings

            from app.services.vlm_provider import get_vlm_provider, OllamaProvider
            provider = get_vlm_provider()
            assert isinstance(provider, OllamaProvider)
            assert provider.model == "qwen3-vl:8b"

    def test_get_provider_none(self):
        with patch("app.core.config.get_settings") as mock_settings:
            settings = MagicMock()
            settings.vlm_provider = "none"
            mock_settings.return_value = settings

            from app.services.vlm_provider import get_vlm_provider
            provider = get_vlm_provider()
            assert provider is None

    def test_get_provider_qwen_api(self):
        with patch("app.core.config.get_settings") as mock_settings:
            settings = MagicMock()
            settings.vlm_provider = "qwen_api"
            settings.qwen_api_key = "test-key"
            settings.qwen_api_base = "https://dashscope.aliyuncs.com/compatible-mode/v1"
            settings.qwen_model = "qwen-vl-max"
            mock_settings.return_value = settings

            from app.services.vlm_provider import get_vlm_provider, QwenAPIProvider
            provider = get_vlm_provider()
            assert isinstance(provider, QwenAPIProvider)
            assert provider.model == "qwen-vl-max"

    def test_get_provider_qwen_api_no_key(self):
        with patch("app.core.config.get_settings") as mock_settings:
            settings = MagicMock()
            settings.vlm_provider = "qwen_api"
            settings.qwen_api_key = ""
            mock_settings.return_value = settings

            from app.services.vlm_provider import get_vlm_provider
            provider = get_vlm_provider()
            assert provider is None


class TestVLMResponse:
    def test_vlm_response_dataclass(self):
        from app.services.vlm_provider import VLMResponse
        resp = VLMResponse(caption="test caption", model_used="test-model", provider="ollama")
        assert resp.caption == "test caption"
        assert resp.model_used == "test-model"
        assert resp.provider == "ollama"
