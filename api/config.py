"""Application settings loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_API_DIR = Path(__file__).resolve().parent


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

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
