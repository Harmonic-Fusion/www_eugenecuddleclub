"""Unit tests for config and email-cache pure helpers."""

from __future__ import annotations

from config import async_database_url
from email_cache import is_test_login_email, normalize_email


def test_async_database_url_rewrites_postgres_schemes():
    assert (
        async_database_url("postgres://u:p@h/db")
        == "postgresql+asyncpg://u:p@h/db"
    )
    assert (
        async_database_url("postgresql://u:p@h/db")
        == "postgresql+asyncpg://u:p@h/db"
    )
    assert (
        async_database_url("postgresql+asyncpg://u:p@h/db")
        == "postgresql+asyncpg://u:p@h/db"
    )


def test_normalize_email():
    assert normalize_email("  Ada@Example.COM ") == "ada@example.com"


def test_is_test_login_email():
    assert is_test_login_email("you+test@gmail.com") is True
    assert is_test_login_email("you+TEST+extra@example.com") is True
    assert is_test_login_email("you@example.com") is False
    assert is_test_login_email("not-an-email") is False
