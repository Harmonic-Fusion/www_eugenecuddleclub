"""Application settings loaded from environment variables."""

from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_API_DIR = Path(__file__).resolve().parent

FUNGALOW_MAPS_URL = "https://maps.app.goo.gl/45dc2G7VVqfcQSETA"
FUNGALOW_MAPS_LABEL = "2296 Cleveland, Eugene, Oregon"


def async_database_url(url: str) -> str:
    """Railway (and most hosts) give postgresql://; SQLAlchemy async needs +asyncpg."""
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_API_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ticket_tailor_api_key: str
    cors_origins: str = (
        "https://eugenecuddleclub.com,http://localhost:8080"
    )
    ticket_tailor_base_url: str = "https://api.tickettailor.com/v1"

    database_url: str = "postgresql+asyncpg://ecc:ecc@localhost:5432/ecc"
    jwt_secret: str = "dev-insecure-change-me"
    site_url: str = "http://localhost:8080"

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"

    resend_api_key: str = ""
    resend_from: str = "Eugene Cuddle Club <onboarding@resend.dev>"

    jwt_ttl_seconds: int = 60 * 60 * 24 * 30
    otp_ttl_seconds: int = 60 * 10

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: Any) -> Any:
        if isinstance(value, str):
            return async_database_url(value)
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
