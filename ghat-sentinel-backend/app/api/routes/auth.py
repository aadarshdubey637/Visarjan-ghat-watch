from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.auth import AUTH_RESPONSES, create_access_token, current_user, user_admins
from app.config import settings
from app.database import get_db
from app.dependencies import check_login_allowed, clear_login_failures, record_login_failure
from app.exceptions import CannotDeactivateSelfError, ForbiddenError, InvalidCredentialsError, UserNotFoundError
from app.models import User
from app.schemas.auth import (ROLES, AuthConfig, AuthUser, DemoAccount, LoginRequest, RegisterRequest, Role,
                              TokenResponse, UserCreate, UserList, UserOut, UserUpdate, normalise_email)
from app.schemas.common import ErrorResponse
from app.services import users

router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(prefix="/users", tags=["users"])
E = {422: {"model": ErrorResponse}}


@router.get("/config", response_model=AuthConfig, summary="Public auth configuration")
def auth_config():
    demo = [DemoAccount(role=a["role"], email=a["email"], password=a["password"]) for a in users.DEMO_ACCOUNTS]
    demo = demo if users.demo_enabled() else []
    # The presenter login is deliberately public so a demo audience can use it (set only for demo deployments).
    p_email, p_pw = settings.PRESENTER_EMAIL.strip(), settings.PRESENTER_PASSWORD
    if p_email and p_pw and not any(a.role == "demo" for a in demo):
        demo.append(DemoAccount(role="demo", email=p_email, password=p_pw))
    return AuthConfig(auth_enabled=settings.AUTH_ENABLED, roles=ROLES, demo_accounts=demo)


@router.post("/login", response_model=TokenResponse, summary="Log in with email and password",
             responses={401: {"model": ErrorResponse}, 429: {"model": ErrorResponse}, **E})
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    email = normalise_email(body.email)
    check_login_allowed(request, email)
    try:
        user = users.authenticate(db, email, body.password)
    except InvalidCredentialsError:
        record_login_failure(request, email)
        raise
    clear_login_failures(request, email)
    return create_access_token(user)


@router.post("/register", response_model=TokenResponse, status_code=201,
             summary="Self-register a community (citizen) account",
             responses={409: {"model": ErrorResponse}, **E})
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    return create_access_token(users.create_user(db, body.name, body.email, body.password, "citizen"))


@router.get("/me", response_model=AuthUser, summary="Current user", responses={401: {"model": ErrorResponse}})
def me(user: AuthUser = Depends(current_user)):
    return user


@users_router.get("", response_model=UserList, summary="List users (officer, developer)",
                  responses={**AUTH_RESPONSES, **E})
def list_users(role: Role | None = None, limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
               _: AuthUser = Depends(user_admins), db: Session = Depends(get_db)):
    return users.list_users(db, role, limit, offset)


@users_router.post("", response_model=UserOut, status_code=201, summary="Create a worker/officer/developer account",
                   description="Officers may create worker and officer accounts; only developers may create "
                               "developer accounts. Citizens self-register via /auth/register.",
                   responses={**AUTH_RESPONSES, 409: {"model": ErrorResponse}, **E})
def create_user(body: UserCreate, actor: AuthUser = Depends(user_admins), db: Session = Depends(get_db)):
    allowed = {"worker", "officer"} | ({"developer"} if actor.role == "developer" else set())
    if body.role not in allowed:
        raise ForbiddenError(f"You are not allowed to create '{body.role}' accounts.")
    return users.to_out(users.create_user(db, body.name, body.email, body.password, body.role, body.phone))


@users_router.patch("/{user_id}", response_model=UserOut, summary="Activate/deactivate or rename a user",
                    responses={**AUTH_RESPONSES, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}, **E})
def update_user(user_id: str, body: UserUpdate, actor: AuthUser = Depends(user_admins), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if target is None:
        raise UserNotFoundError(f"User '{user_id}' was not found.")
    if target.role == "developer" and actor.role != "developer":
        raise ForbiddenError("Only developers can modify developer accounts.")
    if body.is_active is False and target.id == actor.id:
        raise CannotDeactivateSelfError("You cannot deactivate your own account.")
    if body.is_active is not None:
        target.is_active = body.is_active
    if body.name is not None:
        target.name = body.name.strip()
    if "phone" in body.model_fields_set:
        target.phone = body.phone  # null / '' clears it
    db.commit()
    return users.to_out(target)
