"""User accounts: password hashing, creation, authentication and startup seeding."""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import uuid
from datetime import timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.exceptions import EmailTakenError, InvalidCredentialsError
from app.models import User
from app.schemas.auth import UserList, UserOut, normalise_email
from app.services.common import utcnow

log = logging.getLogger("ghat_sentinel")

SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**14, 8, 1
DEMO_ACCOUNTS = [
    {"role": "officer", "email": "officer@ghat.demo", "password": "Officer#Demo2026", "name": "Demo Officer"},
    {"role": "worker", "email": "worker@ghat.demo", "password": "Worker#Demo2026", "name": "Demo Field Worker"},
    {"role": "citizen", "email": "citizen@ghat.demo", "password": "Citizen#Demo2026", "name": "Demo Community Member"},
    {"role": "developer", "email": "developer@ghat.demo", "password": "Developer#Demo2026", "name": "Demo Developer"},
    {"role": "demo", "email": "presenter@ghat.demo", "password": "Presenter#Demo2026", "name": "Demo Presenter"},
]
INVALID = "Incorrect email or password."


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=32)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, expected = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p),
                                dklen=len(expected) // 2)
        return hmac.compare_digest(digest.hex(), expected)
    except (ValueError, TypeError):
        return False


_DUMMY_HASH = hash_password("dummy-password-for-timing")


def demo_enabled() -> bool:
    return settings.DEMO_USERS and settings.APP_ENV == "development"


def to_out(u: User) -> UserOut:
    return UserOut(id=u.id, email=u.email, name=u.name, role=u.role, is_active=u.is_active,
                   created_at=u.created_at.replace(tzinfo=timezone.utc))


def get_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalise_email(email)))


def create_user(db: Session, name: str, email: str, password: str, role: str) -> User:
    email = normalise_email(email)
    if get_by_email(db, email):
        raise EmailTakenError("An account with this email already exists.")
    user = User(id=f"usr_{uuid.uuid4().hex[:10]}", email=email, name=name.strip(), role=role,
                password_hash=hash_password(password), is_active=True, created_at=utcnow())
    try:
        db.add(user)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise EmailTakenError("An account with this email already exists.") from None
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    """Same error for unknown email, wrong password and inactive user (no user enumeration)."""
    user = get_by_email(db, email)
    ok = verify_password(password, user.password_hash if user else _DUMMY_HASH)
    if not (user and ok and user.is_active):
        raise InvalidCredentialsError(INVALID)
    return user


def list_users(db: Session, role: str | None, limit: int, offset: int) -> UserList:
    q = select(User)
    if role:
        q = q.where(User.role == role)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(User.created_at, User.id).limit(limit).offset(offset)).all()
    return UserList(items=[to_out(u) for u in rows], total=total, limit=limit, offset=offset)


def upsert_user(db: Session, name: str, email: str, password: str, role: str) -> User:
    """Create or update (used by scripts/create_user.py)."""
    user = get_by_email(db, email)
    if user is None:
        return create_user(db, name, email, password, role)
    user.name, user.role, user.password_hash, user.is_active = name.strip(), role, hash_password(password), True
    db.commit()
    return user


def seed_users(db: Session) -> None:
    """Idempotent startup seeding: bootstrap officer, and demo accounts in development only."""
    email, pw = settings.BOOTSTRAP_OFFICER_EMAIL.strip(), settings.BOOTSTRAP_OFFICER_PASSWORD
    if email and pw and not get_by_email(db, email):
        create_user(db, "Bootstrap Officer", email, pw, "officer")
        log.info("Created bootstrap officer account.")
    p_email, p_pw = settings.PRESENTER_EMAIL.strip(), settings.PRESENTER_PASSWORD
    if p_email and p_pw and not get_by_email(db, p_email):
        create_user(db, "Demo Presenter", p_email, p_pw, "demo")
        log.info("Created presenter (demo role) account.")
    if demo_enabled():
        for acc in DEMO_ACCOUNTS:
            if not get_by_email(db, acc["email"]):
                create_user(db, acc["name"], acc["email"], acc["password"], acc["role"])
