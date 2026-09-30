"""Shared fixtures. Env must be set before app modules import Settings/db."""

from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

_API_DIR = Path(__file__).resolve().parents[1]
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

# Ensure Settings can construct without a real .env during CI / fresh checkouts.
os.environ.setdefault("TICKET_TAILOR_API_KEY", "test-api-key")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://ecc:ecc@localhost:5432/ecc_test"
)
os.environ.setdefault(
    "JWT_SECRET", "test-jwt-secret-not-for-production-32b+"
)
os.environ.setdefault("SITE_URL", "http://localhost:8080")
os.environ.setdefault("RESEND_API_KEY", "")

from config import Settings, get_settings  # noqa: E402
from models import User  # noqa: E402


@pytest.fixture
def settings() -> Settings:
    get_settings.cache_clear()
    s = Settings(
        ticket_tailor_api_key="test-api-key",
        jwt_secret="test-jwt-secret-not-for-production-32b+",
        site_url="http://localhost:8080",
        database_url="postgresql+asyncpg://ecc:ecc@localhost:5432/ecc_test",
        resend_api_key="",
    )
    return s


@pytest.fixture
def sample_user() -> User:
    return User(
        id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
        email="buyer@example.com",
        google_sub=None,
        created_at=datetime.now(timezone.utc),
    )


@pytest.fixture
def raw_public_event() -> dict[str, Any]:
    return {
        "id": "ev_public",
        "name": "Friday Cuddle",
        "description": "A cozy evening",
        "start": {
            "date": "2030-06-01",
            "formatted": "1 Jun 2030 19:00",
            "iso": "2030-06-01T19:00:00-07:00",
            "time": "19:00",
            "timezone": "America/Los_Angeles",
            "unix": 1906538400,
        },
        "end": {
            "date": "2030-06-01",
            "formatted": "1 Jun 2030 22:00",
            "iso": "2030-06-01T22:00:00-07:00",
            "time": "22:00",
            "timezone": "America/Los_Angeles",
            "unix": 1906549200,
        },
        "venue": {
            "name": "The Bliss Fungalow",
            "postal_code": "97405",
            "country": "US",
        },
        "images": {"header": None, "thumbnail": None},
        "checkout_url": "https://www.tickettailor.com/checkout/u/ev_public",
        "status": "published",
        "tickets_available": True,
        "unavailable": False,
        "hidden": False,
        "private": False,
        "call_to_action": "Get tickets",
        "url": "https://www.tickettailor.com/events/eugenecuddleclub/ev_public",
        "online_event": False,
    }


@pytest.fixture
def mock_tt_client() -> MagicMock:
    client = MagicMock()
    client.list_events = AsyncMock(return_value=[])
    client.get_event = AsyncMock()
    client.list_issued_tickets = AsyncMock(return_value=[])
    return client


@pytest.fixture
def client(settings: Settings, mock_tt_client: MagicMock):
    """HTTP client against the FastAPI app with lifespan off and deps overridden."""
    from contextlib import asynccontextmanager

    from fastapi.testclient import TestClient

    import main
    from auth import get_client as auth_get_client
    from config import get_settings
    from main import app, get_client

    get_settings.cache_clear()
    main._refund_request_times.clear()

    def override_settings() -> Settings:
        return settings

    def override_client() -> MagicMock:
        return mock_tt_client

    app.dependency_overrides[get_settings] = override_settings
    app.dependency_overrides[get_client] = override_client
    app.dependency_overrides[auth_get_client] = override_client

    @asynccontextmanager
    async def _noop_lifespan(_app):
        yield

    # Skip DB connect + email-cache background task (older Starlette has no lifespan="off")
    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = _noop_lifespan

    with TestClient(app) as test_client:
        yield test_client

    app.router.lifespan_context = original_lifespan
    app.dependency_overrides.clear()
    main._refund_request_times.clear()


@pytest.fixture
def authed_client(client, sample_user: User, settings: Settings):
    """Same as client, but require_user returns sample_user."""
    from auth import require_user
    from main import app

    async def override_require_user() -> User:
        return sample_user

    app.dependency_overrides[require_user] = override_require_user
    return client
