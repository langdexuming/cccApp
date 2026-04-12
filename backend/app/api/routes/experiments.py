from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.db.session import get_session
from app.schemas.experiments import ExperimentCreate, ExperimentRead
from app.schemas.runs import RunRead
from app.services.experiments import create_experiment, create_run, get_experiment, list_experiments
from app.services.runs import get_artifacts, get_metrics


router = APIRouter()


@router.post("", response_model=ExperimentRead, status_code=status.HTTP_201_CREATED)
def create_experiment_route(
    payload: ExperimentCreate, session: Session = Depends(get_session)
) -> ExperimentRead:
    experiment = create_experiment(session, payload)
    return ExperimentRead.from_model(experiment)


@router.get("", response_model=list[ExperimentRead])
def list_experiments_route(session: Session = Depends(get_session)) -> list[ExperimentRead]:
    return [ExperimentRead.from_model(item) for item in list_experiments(session)]


@router.get("/{experiment_id}", response_model=ExperimentRead)
def get_experiment_route(experiment_id: str, session: Session = Depends(get_session)) -> ExperimentRead:
    experiment = get_experiment(session, experiment_id)
    if experiment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found.")
    return ExperimentRead.from_model(experiment)


@router.post("/{experiment_id}/runs", response_model=RunRead, status_code=status.HTTP_201_CREATED)
def create_experiment_run_route(
    experiment_id: str, session: Session = Depends(get_session)
) -> RunRead:
    experiment = get_experiment(session, experiment_id)
    if experiment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found.")
    run = create_run(session, experiment)
    return RunRead.from_model(run, artifacts=get_artifacts(session, run.id), metrics=get_metrics(session, run.id))
