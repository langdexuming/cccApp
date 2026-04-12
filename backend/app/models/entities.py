from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.core.ids import make_id, utcnow


class Experiment(SQLModel, table=True):
    id: str = Field(default_factory=lambda: make_id("exp"), primary_key=True)
    name: str
    scene: str = "告警诊断"
    base_model: str
    trainer_backend: str = "llamafactory"
    route_type: str = "sft"
    dataset_version: str
    evalset_version: str
    prompt_template_version: str
    train_config_json: str = "{}"
    infer_config_json: str = "{}"
    status: str = "draft"
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Run(SQLModel, table=True):
    id: str = Field(default_factory=lambda: make_id("run"), primary_key=True)
    experiment_id: str = Field(index=True)
    run_no: int = 1
    status: str = "pending"
    current_step: Optional[str] = None
    output_dir: Optional[str] = None
    log_path: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class Metric(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: str = Field(index=True)
    metric_group: str
    metric_name: str
    metric_value: float
    metric_extra_json: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class Artifact(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: str = Field(index=True)
    artifact_type: str
    file_path: str
    meta_json: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
