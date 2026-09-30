"""Unit tests for auth helpers that need no database."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import jwt
import pytest
from fastapi import HTTPException

from auth import (
    create_access_token,
    decode_access_token,
    hash_secret,
    is_google_email,
)
from config import Settings
from models import User


def test_is_google_email():
    assert is_google_email("Ada@Gmail.com") is True
    assert is_google_email("bob@googlemail.com") is True
    assert is_google_email("carol@example.com") is False


def test_hash_secret_is_sha256_hex():
    digest = hash_secret("123456")
    assert len(digest) == 64
    assert digest == hash_secret("123456")
    assert digest != hash_secret("123457")


def test_create_and_decode_access_token(settings: Settings):
    user = User(
        id=uuid.UUID("22222222-2222-2222-2222-222222222222"),
        email="buyer@example.com",
        created_at=datetime.now(timezone.utc),
    )
    token = create_access_token(user, settings)
    payload = decode_access_token(token, settings)
    assert payload["sub"] == str(user.id)
    assert payload["email"] == "buyer@example.com"


def test_decode_access_token_rejects_bad_signature(settings: Settings):
    user = User(
        id=uuid.uuid4(),
        email="buyer@example.com",
        created_at=datetime.now(timezone.utc),
    )
    token = create_access_token(user, settings)
    other = settings.model_copy(
        update={"jwt_secret": "different-secret-also-long-enough!!"}
    )
    with pytest.raises(HTTPException) as exc:
        decode_access_token(token, other)
    assert exc.value.status_code == 401


def test_decode_access_token_rejects_expired(settings: Settings):
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "email": "buyer@example.com",
            "iat": int(now.timestamp()) - 100,
            "exp": int(now.timestamp()) - 10,
        },
        settings.jwt_secret,
        algorithm="HS256",
    )
    with pytest.raises(HTTPException) as exc:
        decode_access_token(token, settings)
    assert exc.value.status_code == 401
