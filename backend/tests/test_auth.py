"""Tests for auth endpoints."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestRegister:
    async def test_register_success(self, client, mock_db):
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()

        resp = await client.post("/api/auth/register", json={
            "username": "newuser",
            "password": "securepass123",
            "email": "new@test.com",
        })

        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data

    async def test_register_existing_user(self, client, mock_db):
        existing = MagicMock()
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=existing)))

        resp = await client.post("/api/auth/register", json={
            "username": "existing",
            "password": "securepass123",
        })

        assert resp.status_code == 400

    async def test_register_missing_username(self, client, mock_db):
        resp = await client.post("/api/auth/register", json={
            "password": "securepass123",
        })

        assert resp.status_code == 422


class TestLogin:
    async def test_login_success(self, client, mock_db):
        from app.core.security import hash_password
        user = MagicMock()
        user.id = uuid.uuid4()
        user.username = "testuser"
        user.password_hash = hash_password("correctpass")

        mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=user)))
        mock_db.commit = AsyncMock()

        resp = await client.post("/api/auth/login", json={
            "username": "testuser",
            "password": "correctpass",
        })

        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data

    async def test_login_wrong_password(self, client, mock_db):
        from app.core.security import hash_password
        user = MagicMock()
        user.password_hash = hash_password("correctpass")

        mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=user)))

        resp = await client.post("/api/auth/login", json={
            "username": "testuser",
            "password": "wrongpass",
        })

        assert resp.status_code == 401

    async def test_login_nonexistent_user(self, client, mock_db):
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

        resp = await client.post("/api/auth/login", json={
            "username": "nobody",
            "password": "anything",
        })

        assert resp.status_code == 401
