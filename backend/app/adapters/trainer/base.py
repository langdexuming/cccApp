from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.models.entities import Experiment, Run


@dataclass(slots=True)
class RunContext:
    settings: Settings
    experiment: Experiment
    run: Run
    run_dir: Path
    input_dir: Path
    output_dir: Path
    log_dir: Path


@dataclass(slots=True)
class PreparedRun:
    trainer_backend: str
    route_type: str
    train_config_path: Path | None = None
    export_config_path: Path | None = None
    train_command: str | None = None
    export_command: str | None = None
    train_command_args: list[str] | None = None
    export_command_args: list[str] | None = None
    train_env: dict[str, str] | None = None
    export_env: dict[str, str] | None = None
    notes: list[str] = field(default_factory=list)
    extra_files: list[Path] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)


class BaseTrainerAdapter:
    name = "base"

    def prepare(self, context: RunContext) -> PreparedRun:
        raise NotImplementedError

    def requires_training(self, context: RunContext) -> bool:
        return context.experiment.route_type != "baseline_infer"

    def can_export(self, context: RunContext) -> bool:
        return self.requires_training(context)
