"""JWT bearer authentication and role-based access dependencies."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import ensure_jwt_secret, settings
from app.database import get_db
from app.exceptions import ForbiddenError, UnauthenticatedError
from app.models import User
from app.schemas.auth import AuthUser, TokenResponse
from app.schemas.common import ErrorResponse

ALGORITHM = "HS256"
ANONYMOUS = AuthUser(id="usr_anonymous", email="anonymous@local", name="Anonymous (auth disabled)", role="developer")
bearer = HTTPBearer(auto_error=False, description="JWT from POST /auth/login")

AUTH_RESPONSES = {401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}}


def create_access_token(user: User) -> TokenResponse:
    ensure_jwt_secret()
    now = datetime.now(timezone.utc)
    expires = timedelta(minutes=settings.ACCESS_TOKEN_MINUTES)
    token = jwt.encode({"sub": user.id, "role": user.role, "iat": now, "exp": now + expires},
                       settings.JWT_SECRET, algorithm=ALGORITHM)
    return TokenResponse(access_token=token, expires_in=int(expires.total_seconds()),
                         user=AuthUser(id=user.id, email=user.email, name=user.name, role=user.role))


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                 db: Session = Depends(get_db)) -> AuthUser:
    if not settings.AUTH_ENABLED:
        return ANONYMOUS
    if creds is None or not creds.credentials:
        raise UnauthenticatedError("Authentication required.")
    ensure_jwt_secret()
    try:
        claims = jwt.decode(creds.credentials, settings.JWT_SECRET, algorithms=[ALGORITHM],
                            options={"require": ["exp", "sub"]})
    except jwt.PyJWTError:
        raise UnauthenticatedError("Invalid or expired token.") from None
    user = db.get(User, str(claims["sub"]))  # always re-load: deactivation / role changes apply immediately
    if user is None or not user.is_active:
        raise UnauthenticatedError("Invalid or expired token.")
    return AuthUser(id=user.id, email=user.email, name=user.name, role=user.role)


def require_roles(*roles: str):
    def dependency(user: AuthUser = Depends(current_user)) -> AuthUser:
        if settings.AUTH_ENABLED and user.role not in roles:
            raise ForbiddenError("Your role is not allowed to perform this action.")
        return user

    return dependency


staff = require_roles("officer", "worker", "developer", "demo")  # everyone except citizens
managers = require_roles("officer", "developer", "demo")  # officer-level rights (demo = presenter)
user_admins = require_roles("officer", "developer")  # user management: never the demo presenter
