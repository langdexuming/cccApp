from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.db.session import get_session
from app.schemas.runs import RunRead
from app.services.runs import get_artifacts, get_metrics, get_run, list_runs


router = APIRouter()


@router.get("", response_model=list[RunRead])
def list_runs_route(session: Session = Depends(get_session)) -> list[RunRead]:
    runs = list_runs(session)
    return [
        RunRead.from_model(run, artifacts=get_artifacts(session, run.id), metrics=get_metrics(session, run.id))
        for run in runs
    ]


@router.get("/{run_id}", response_model=RunRead)
def get_run_route(run_id: str, session: Session = Depends(get_session)) -> RunRead:
    run = get_run(session, run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")
    return RunRead.from_model(run, artifacts=get_artifacts(session, run.id), metrics=get_metrics(session, run.id))
