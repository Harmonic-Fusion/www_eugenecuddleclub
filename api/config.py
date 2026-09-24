"""Application settings loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_API_DIR = Path(__file__).resolve().parent

FUNGALOW_MAPS_URL = "https://maps.app.goo.gl/45dc2G7VVqfcQSETA"
FUNGALOW_MAPS_LABEL = "2296 Cleveland, Eugene, Oregon"


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

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
