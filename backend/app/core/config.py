from functools import lru_cache
from pathlib import Path

from pydantic import AnyHttpUrl, EmailStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# Always resolve .env relative to this file, regardless of the working directory
# config.py lives at  backend/app/core/config.py
# .env lives at       backend/.env  →  3 levels up from this file
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    app_name: str = "Company Expense Tracking Dashboard"
    environment: str = "local"
    secret_key: str = "dev-only-change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480
    database_url: str = "sqlite:///./expense_dashboard.db"
    frontend_url: AnyHttpUrl | str = "http://localhost:5173"

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: EmailStr | str = "finance-alerts@bilvantis.com"
    smtp_tls: bool = True

    finance_admin_email: EmailStr | str = "admin@bilvantis.com"

    # ── Gemini / Google ADK ───────────────────────────────────────────────────
    vertex_enabled: bool = False
    google_api_key: str | None = None
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.0-flash"
    vertex_model: str = "gemini-2.0-flash"
    usd_rate: float = 83.0

    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
