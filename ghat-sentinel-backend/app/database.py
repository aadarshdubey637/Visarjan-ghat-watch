from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


def make_engine(url: str):
    is_sqlite = url.startswith("sqlite")
    kwargs = {"connect_args": {"check_same_thread": False}} if is_sqlite else {}
    if is_sqlite and (":memory:" in url or url.rstrip("/") == "sqlite:"):
        from sqlalchemy.pool import StaticPool

        kwargs["poolclass"] = StaticPool
    eng = create_engine(url, **kwargs)
    if is_sqlite:

        @event.listens_for(eng, "connect")
        def _pragmas(dbapi_conn, _rec):
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

    return eng


engine = make_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db(bind=None) -> None:
    from app import models  # noqa: F401  (registers tables)

    eng = bind or engine
    Base.metadata.create_all(bind=eng)
    _migrate(eng)


def _migrate(eng) -> None:
    """Tiny additive migrations so existing deployed databases keep working."""
    cols = {c["name"] for c in inspect(eng).get_columns("review_cases")}
    if "created_by" not in cols:
        with eng.begin() as conn:
            conn.execute(text("ALTER TABLE review_cases ADD COLUMN created_by VARCHAR(120)"))
