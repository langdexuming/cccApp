from __future__ import annotations

from sqlmodel import Session, asc, desc, select

from app.models.entities import Artifact, Metric, Run


def list_runs(session: Session) -> list[Run]:
    statement = select(Run).order_by(desc(Run.created_at))
    return list(session.exec(statement))


def list_pending_runs(session: Session) -> list[Run]:
    statement = select(Run).where(Run.status == "pending").order_by(asc(Run.created_at))
    return list(session.exec(statement))


def get_run(session: Session, run_id: str) -> Run | None:
    return session.get(Run, run_id)


def get_artifacts(session: Session, run_id: str) -> list[Artifact]:
    statement = select(Artifact).where(Artifact.run_id == run_id).order_by(Artifact.created_at)
    return list(session.exec(statement))


def get_metrics(session: Session, run_id: str) -> list[Metric]:
    statement = select(Metric).where(Metric.run_id == run_id).order_by(Metric.created_at)
    return list(session.exec(statement))
