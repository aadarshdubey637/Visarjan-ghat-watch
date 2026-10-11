import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import Page

Role = Literal["officer", "worker", "citizen", "developer", "demo"]
ROLES: list[str] = ["officer", "worker", "citizen", "developer", "demo"]
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalise_email(value: str) -> str:
    return value.strip().lower()


def _valid_email(value: str) -> str:
    value = normalise_email(value)
    if len(value) > 254 or not _EMAIL.match(value):
        raise ValueError("must be a valid email address")
    return value


def normalise_phone(value: str) -> str:
    """'+91 98765-43210' -> '+919876543210'; digits only otherwise. 8-15 digits required."""
    cleaned = re.sub(r"[\s\-().]", "", value.strip())
    if not re.fullmatch(r"\+?\d+", cleaned) or not 8 <= len(cleaned.lstrip("+")) <= 15:
        raise ValueError("must be a phone number with 8 to 15 digits")
    return cleaned


def _optional_phone(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    return normalise_phone(value)


class LoginRequest(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=128)


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str
    password: str = Field(min_length=8, max_length=128)

    _email = field_validator("email")(_valid_email)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("name must have at least 2 characters")
        return v


class UserCreate(RegisterRequest):
    role: Role
    phone: str | None = Field(None, max_length=30, description="E.164-like, 8-15 digits; stored normalised")

    _phone = field_validator("phone")(_optional_phone)


class UserUpdate(BaseModel):
    is_active: bool | None = None
    name: str | None = Field(None, min_length=2, max_length=80)
    phone: str | None = Field(None, max_length=30, description="Send null or '' to clear")

    _phone = field_validator("phone")(_optional_phone)


class AuthUser(BaseModel):
    id: str
    email: str
    name: str
    role: Role


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(description="Seconds until the token expires")
    user: AuthUser


class UserOut(AuthUser):
    is_active: bool
    phone: str | None = None
    created_at: datetime


class UserList(Page):
    items: list[UserOut]


class DemoAccount(BaseModel):
    role: Role
    email: str
    password: str


class AuthConfig(BaseModel):
    auth_enabled: bool
    roles: list[Role]
    demo_accounts: list[DemoAccount]
