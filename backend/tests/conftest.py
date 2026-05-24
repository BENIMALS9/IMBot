"""Shared test fixtures for ImageDB backend tests."""

import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def patch_init_db():
    """Prevent init_db from connecting to real database during test app startup."""
    with patch("app.main.init_db", new_callable=AsyncMock):
        yield


@pytest.fixture
def test_user():
    return MagicMock(
        id=uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
        username="testuser",
        email="test@example.com",
        is_active=True,
    )


@pytest.fixture
def mock_db():
    """Return an AsyncMock that mimics an async SQLAlchemy session."""
    session = AsyncMock()
    session.commit = AsyncMock()
    session.flush = AsyncMock()
    session.rollback = AsyncMock()
    session.delete = AsyncMock()
    session.add = MagicMock()
    session.execute = AsyncMock()
    session.scalar = AsyncMock()
    session.get = AsyncMock()
    return session


@pytest.fixture
def app_with_mocks(mock_db, test_user):
    """FastAPI app with get_db and get_current_user overridden."""
    from app.main import app
    from app.core.database import get_db
    from app.core.security import get_current_user

    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_current_user] = lambda: test_user
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
async def client(app_with_mocks):
    """Async HTTP client for testing the FastAPI app."""
    from httpx import ASGITransport, AsyncClient

    transport = ASGITransport(app=app_with_mocks)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def sample_image_id():
    return "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


@pytest.fixture
def sample_person_id():
    return "cccccccc-cccc-cccc-cccc-cccccccccccc"
