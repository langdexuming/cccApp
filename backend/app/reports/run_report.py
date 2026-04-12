from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.ids import utcnow
from app.models.entities import Experiment, Run


def build_run_report(
    *,
    report_path: Path,
    experiment: Experiment,
    run: Run,
    trainer_backend: str,
    route_type: str,
    command_preview: dict[str, Any],
    ollama: dict[str, Any] | None = None,
    evaluation: dict[str, Any] | None = None,
    benchmark: dict[str, Any] | None = None,
) -> None:
    payload = {
        "generated_at": utcnow().isoformat(),
        "experiment": {
            "id": experiment.id,
            "name": experiment.name,
            "base_model": experiment.base_model,
            "trainer_backend": experiment.trainer_backend,
            "route_type": experiment.route_type,
        },
        "run": {
            "id": run.id,
            "run_no": run.run_no,
            "status": run.status,
            "current_step": run.current_step,
        },
        "preview": {
            "trainer_backend": trainer_backend,
            "route_type": route_type,
            "command_preview": command_preview,
        },
        "ollama": ollama or {},
        "evaluation": evaluation or {},
        "benchmark": benchmark or {},
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
