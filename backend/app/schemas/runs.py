from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.entities import Artifact, Metric, Run


class RunCreate(BaseModel):
    pass


class ArtifactRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    run_id: str
    artifact_type: str
    file_path: str
    meta_json: str | None
    created_at: datetime

    @classmethod
    def from_model(cls, artifact: Artifact) -> "ArtifactRead":
        return cls.model_validate(artifact)


class MetricRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    run_id: str
    metric_group: str
    metric_name: str
    metric_value: float
    metric_extra_json: str | None
    created_at: datetime

    @classmethod
    def from_model(cls, metric: Metric) -> "MetricRead":
        return cls.model_validate(metric)


class RunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    experiment_id: str
    run_no: int
    status: str
    current_step: str | None
    output_dir: str | None
    log_path: str | None
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    artifacts: list[ArtifactRead] = []
    metrics: list[MetricRead] = []

    @classmethod
    def from_model(
        cls,
        run: Run,
        *,
        artifacts: list[Artifact] | None = None,
        metrics: list[Metric] | None = None,
    ) -> "RunRead":
        return cls(
            id=run.id,
            experiment_id=run.experiment_id,
            run_no=run.run_no,
            status=run.status,
            current_step=run.current_step,
            output_dir=run.output_dir,
            log_path=run.log_path,
            error_message=run.error_message,
            created_at=run.created_at,
            started_at=run.started_at,
            finished_at=run.finished_at,
            artifacts=[ArtifactRead.from_model(item) for item in (artifacts or [])],
            metrics=[MetricRead.from_model(item) for item in (metrics or [])],
        )
