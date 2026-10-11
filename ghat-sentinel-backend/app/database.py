from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


def normalise_database_url(url: str) -> str:
    """Map postgres:// and postgresql:// (what Neon/Heroku-style providers hand out) to the psycopg 3 driver.

    Query parameters such as sslmode and channel_binding are kept as they are.
    """
    url = url.strip()
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def make_engine(url: str):
    url = normalise_database_url(url)
    is_sqlite = url.startswith("sqlite")
    if is_sqlite:
        kwargs: dict = {"connect_args": {"check_same_thread": False}}
        if ":memory:" in url or url.rstrip("/") == "sqlite:":
            from sqlalchemy.pool import StaticPool

            kwargs["poolclass"] = StaticPool
    else:
        kwargs = {
            "pool_pre_ping": True,   # Neon scales to zero and closes idle connections
            "pool_recycle": 300,
            "pool_size": 5,
            "max_overflow": 5,
            # Neon's pooled endpoint is PgBouncer in transaction mode: no server-side prepared statements.
            "connect_args": {"prepare_threshold": None, "connect_timeout": 15},
        }
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


_ADDITIVE_COLUMNS = [  # (table, column, DDL type): columns added after the first release
    ("review_cases", "created_by", "VARCHAR(120)"),
    ("users", "phone", "VARCHAR(20)"),
]


def _migrate(eng) -> None:
    """Tiny additive migrations so existing deployed databases keep working (SQLite and PostgreSQL)."""
    insp = inspect(eng)
    for table, column, ddl_type in _ADDITIVE_COLUMNS:
        if column in {c["name"] for c in insp.get_columns(table)}:
            continue
        # IF NOT EXISTS (PostgreSQL only) keeps two instances starting at once from failing each other.
        clause = "IF NOT EXISTS " if eng.dialect.name == "postgresql" else ""
        with eng.begin() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {clause}{column} {ddl_type}"))
