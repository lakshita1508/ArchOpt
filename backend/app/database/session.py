"""SQLite engine/session setup."""

import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

from ..core.config import DB_PATH

# Use /tmp on Vercel because its application filesystem is read-only.
if os.environ.get("VERCEL") == "1":
    DATABASE_PATH = Path("/tmp/archopt.db")
else:
    DATABASE_PATH = DB_PATH

DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    f"sqlite:///{DATABASE_PATH.as_posix()}",
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _fk_pragma(dbapi_conn, _record):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()


SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from ..models import models
    Base.metadata.create_all(bind=engine)