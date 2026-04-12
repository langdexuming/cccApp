from __future__ import annotations

from sqlmodel import Session, desc, func, select

from app.core.ids import utcnow
from app.core.json_utils import dumps_json
from app.models.entities import Experiment, Run
from app.schemas.experiments import ExperimentCreate


def create_experiment(session: Session, payload: ExperimentCreate) -> Experiment:
    experiment = Experiment(
        name=payload.name,
        scene=payload.scene,
        base_model=payload.base_model,
        trainer_backend=payload.trainer_backend,
        route_type=payload.route_type,
        dataset_version=payload.dataset_version,
        evalset_version=payload.evalset_version,
        prompt_template_version=payload.prompt_template_version,
        train_config_json=dumps_json(payload.train_config),
        infer_config_json=dumps_json(payload.infer_config),
        status="draft",
    )
    session.add(experiment)
    session.commit()
    session.refresh(experiment)
    return experiment


def list_experiments(session: Session) -> list[Experiment]:
    statement = select(Experiment).order_by(desc(Experiment.created_at))
    return list(session.exec(statement))


def get_experiment(session: Session, experiment_id: str) -> Experiment | None:
    return session.get(Experiment, experiment_id)


def create_run(session: Session, experiment: Experiment) -> Run:
    max_run_no = session.exec(
        select(func.max(Run.run_no)).where(Run.experiment_id == experiment.id)
    ).one()
    run = Run(
        experiment_id=experiment.id,
        run_no=(max_run_no or 0) + 1,
        status="pending",
        current_step="queued",
    )
    experiment.status = "queued"
    experiment.updated_at = utcnow()
    session.add(run)
    session.add(experiment)
    session.commit()
    session.refresh(run)
    return run
