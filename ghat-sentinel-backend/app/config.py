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

    # Messaging (see docs/MESSAGING.md). Secrets come from the environment only and are never returned or logged.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""  # e.g. "Ghat Sentinel <you@example.com>"; falls back to SMTP_USERNAME
    SMTP_STARTTLS: bool = True
    SMTP_USE_SSL: bool = False  # implicit TLS (port 465)
    SMTP_TIMEOUT_SECONDS: float = 15.0
    WHATSAPP_ACCESS_TOKEN: str = ""
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    WHATSAPP_API_VERSION: str = "v21.0"
    WHATSAPP_MODE: str = "template"  # "template" (business-initiated) or "text" (24-hour window only)
    WHATSAPP_TEMPLATE_NAME: str = ""
    WHATSAPP_TEMPLATE_LANG: str = "en"
    WHATSAPP_TIMEOUT_SECONDS: float = 15.0
    MESSAGING_DRY_RUN: bool = False
    MESSAGING_MAX_RECIPIENTS: int = 20
    MESSAGING_MAX_PER_HOUR: int = 60  # per user, in-memory sliding window

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

    @property
    def smtp_sender(self) -> str:
        return self.SMTP_FROM.strip() or self.SMTP_USERNAME.strip()

    @property
    def email_missing(self) -> list[str]:
        """Names (never values) of the settings that prevent e-mail sending."""
        missing = []
        if not self.SMTP_HOST.strip():
            missing.append("SMTP_HOST")
        if not self.smtp_sender:
            missing.append("SMTP_FROM or SMTP_USERNAME")
        if bool(self.SMTP_USERNAME.strip()) != bool(self.SMTP_PASSWORD):
            missing.append("SMTP_PASSWORD" if self.SMTP_USERNAME.strip() else "SMTP_USERNAME")
        return missing

    @property
    def email_configured(self) -> bool:
        return not self.email_missing

    @property
    def whatsapp_missing(self) -> list[str]:
        missing = []
        if not self.WHATSAPP_ACCESS_TOKEN.strip():
            missing.append("WHATSAPP_ACCESS_TOKEN")
        if not self.WHATSAPP_PHONE_NUMBER_ID.strip():
            missing.append("WHATSAPP_PHONE_NUMBER_ID")
        if self.WHATSAPP_MODE == "template" and not self.WHATSAPP_TEMPLATE_NAME.strip():
            missing.append("WHATSAPP_TEMPLATE_NAME")
        return missing

    @property
    def whatsapp_configured(self) -> bool:
        return not self.whatsapp_missing


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
