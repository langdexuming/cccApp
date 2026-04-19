from __future__ import annotations

from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import get_settings
from app.models import Artifact, Experiment, Metric, Run  # noqa: F401


def _ensure_sqlite_path(database_url: str) -> None:
    prefix = "sqlite:///"
    if not database_url.startswith(prefix):
        return
    db_path = Path(database_url.removeprefix(prefix))
    db_path.parent.mkdir(parents=True, exist_ok=True)


settings = get_settings()
_ensure_sqlite_path(settings.database_url)
engine = create_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False},
)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
