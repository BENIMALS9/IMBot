"""Tests for search API endpoints."""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest


class TestSearch:
    async def test_search_all_scope(self, client, mock_db):
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar=MagicMock(return_value=0)))

        resp = await client.get("/api/search", params={"q": "西湖", "scope": "all"})

        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data

    async def test_search_person_scope(self, client, mock_db):
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar=MagicMock(return_value=0)))

        resp = await client.get("/api/search", params={"q": "小明", "scope": "person"})

        assert resp.status_code == 200

    async def test_search_without_query(self, client, mock_db):
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar=MagicMock(return_value=5)))

        resp = await client.get("/api/search")

        assert resp.status_code == 200

    async def test_search_pagination(self, client, mock_db):
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar=MagicMock(return_value=100)))

        resp = await client.get("/api/search", params={"q": "test", "page": 2, "page_size": 20})

        assert resp.status_code == 200
        data = resp.json()
        assert data["page"] == 2
        assert data["page_size"] == 20


class TestSuggestions:
    async def test_suggestions(self, client, mock_db):
        # suggestions endpoint returns a flat list of {label, type} items (max 50)
        empty_result = MagicMock()
        empty_result.__iter__.return_value = iter([])
        mock_db.execute = AsyncMock(return_value=empty_result)

        resp = await client.get("/api/search/suggestions")

        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
