import logging
import secrets
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

    # Authentication (JWT bearer). See docs/AUTH.md.
    AUTH_ENABLED: bool = True
    JWT_SECRET: str = ""
    ACCESS_TOKEN_MINUTES: int = 480
    DEMO_USERS: bool = True  # demo accounts are only ever created/exposed when APP_ENV == "development"
    BOOTSTRAP_OFFICER_EMAIL: str = ""
    BOOTSTRAP_OFFICER_PASSWORD: str = ""
    PRESENTER_EMAIL: str = ""  # optional: demo-role (presenter) account created in any environment
    PRESENTER_PASSWORD: str = ""

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


def ensure_jwt_secret() -> None:
    """Fail fast in production without a secret; otherwise generate an ephemeral one (tokens die on restart)."""
    if not settings.AUTH_ENABLED or settings.JWT_SECRET.strip():
        return
    if settings.APP_ENV == "production":
        raise RuntimeError("JWT_SECRET must be set when APP_ENV=production and AUTH_ENABLED is true.")
    settings.JWT_SECRET = secrets.token_urlsafe(48)
    logging.getLogger("ghat_sentinel").warning(
        "JWT_SECRET is not set: generated a random secret for this process. Tokens become invalid on restart.")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
