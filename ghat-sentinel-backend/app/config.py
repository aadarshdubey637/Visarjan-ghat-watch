from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

RESOURCES_DIR = Path(__file__).resolve().parent / "resources"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "Ghat Sentinel"
    APP_ENV: str = "development"
    API_PREFIX: str = "/api/v1"
    FRONTEND_ORIGIN: str = "http://localhost:3000"
    DATABASE_URL: str = "sqlite:///./ghat_sentinel.db"
    DATA_DIR: str = "./data"

    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = ""
    AI_TIMEOUT_SECONDS: float = 20.0

    AI_RATE_LIMIT_PER_MINUTE: int = 20
    MAX_REQUEST_BYTES: int = 1_000_000
    LOG_LEVEL: str = "INFO"

    # Analysis defaults
    DEFAULT_CPCB_CLASS: str = "B"  # Outdoor bathing (organised): explicit project choice
    FORECAST_MIN_SEASONS: int = 5

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.FRONTEND_ORIGIN.split(",") if o.strip()]

    @property
    def raw_data_dir(self) -> Path:
        return Path(self.DATA_DIR) / "raw"

    @property
    def ai_configured(self) -> bool:
        return bool(self.ANTHROPIC_API_KEY.strip() and self.ANTHROPIC_MODEL.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
