from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.core.json_utils import loads_json
from app.models.entities import Experiment


class ExperimentCreate(BaseModel):
    name: str
    scene: str = "告警诊断"
    base_model: str
    trainer_backend: str = "llamafactory"
    route_type: str = "sft"
    dataset_version: str
    evalset_version: str
    prompt_template_version: str
    train_config: dict[str, Any] = Field(default_factory=dict)
    infer_config: dict[str, Any] = Field(default_factory=dict)


class ExperimentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    scene: str
    base_model: str
    trainer_backend: str
    route_type: str
    dataset_version: str
    evalset_version: str
    prompt_template_version: str
    train_config: dict[str, Any]
    infer_config: dict[str, Any]
    status: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, experiment: Experiment) -> "ExperimentRead":
        return cls(
            id=experiment.id,
            name=experiment.name,
            scene=experiment.scene,
            base_model=experiment.base_model,
            trainer_backend=experiment.trainer_backend,
            route_type=experiment.route_type,
            dataset_version=experiment.dataset_version,
            evalset_version=experiment.evalset_version,
            prompt_template_version=experiment.prompt_template_version,
            train_config=loads_json(experiment.train_config_json, {}),
            infer_config=loads_json(experiment.infer_config_json, {}),
            status=experiment.status,
            created_at=experiment.created_at,
            updated_at=experiment.updated_at,
        )
