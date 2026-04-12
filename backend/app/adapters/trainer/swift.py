from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from app.adapters.trainer.base import BaseTrainerAdapter, PreparedRun, RunContext
from app.core.json_utils import loads_json


class SwiftTrainerAdapter(BaseTrainerAdapter):
    name = "swift"
    _DEFAULT_TEMPLATE = "qwen3"

    def prepare(self, context: RunContext) -> PreparedRun:
        profile = context.settings.trainer_profiles.get("swift", {}).get("sft_default", {})
        overrides = loads_json(context.experiment.train_config_json, {})
        dataset_path = self._resolve_swift_dataset_path(
            context.settings.datasets_root / context.experiment.dataset_version,
            context.experiment.dataset_version,
        )
        eval_plan = self._build_eval_plan(context)

        eval_plan_path = context.input_dir / "swift.eval.yaml"
        with eval_plan_path.open("w", encoding="utf-8") as handle:
            yaml.safe_dump(eval_plan, handle, allow_unicode=False, sort_keys=False)

        preview_notes = [
            "ms-swift is in preview-adaptation mode for phase 2.",
            "This run only materializes train/export/eval plans and does not execute ms-swift.",
            "To enable real execution later, install ms-swift in WSL and replace the adapter execution policy.",
        ]

        if context.experiment.route_type == "baseline_infer":
            notes_path = context.input_dir / "swift.preview.txt"
            notes_path.write_text(
                "ms-swift preview mode is enabled.\n"
                "No training/export will run in the current phase.\n"
                "Use the generated swift.eval.yaml and existing Ollama evaluation flow as a future handoff.\n",
                encoding="utf-8",
            )
            return PreparedRun(
                trainer_backend=self.name,
                route_type=context.experiment.route_type,
                notes=preview_notes,
                extra_files=[notes_path, eval_plan_path],
                meta={
                    "preview_only": True,
                    "dataset_path": str(dataset_path),
                    "eval_plan": eval_plan,
                },
            )

        train_config = self._build_train_config(context, profile, overrides, dataset_path)
        export_config = self._build_export_config(context)

        train_config_path = context.input_dir / "swift.train.yaml"
        export_config_path = context.input_dir / "swift.export.yaml"

        with train_config_path.open("w", encoding="utf-8") as handle:
            yaml.safe_dump(train_config, handle, allow_unicode=False, sort_keys=False)
        with export_config_path.open("w", encoding="utf-8") as handle:
            yaml.safe_dump(export_config, handle, allow_unicode=False, sort_keys=False)

        notes_path = context.input_dir / "swift.preview.txt"
        notes_path.write_text(
            "ms-swift preview mode is enabled.\n"
            f"Base model: {context.experiment.base_model}\n"
            f"Dataset path: {dataset_path}\n"
            "The generated command preview is based on official ms-swift sft/export conventions.\n"
            "No framework installation, model download, training, export, or Ollama registration is performed.\n",
            encoding="utf-8",
        )

        return PreparedRun(
            trainer_backend=self.name,
            route_type=context.experiment.route_type,
            train_config_path=train_config_path,
            export_config_path=export_config_path,
            train_command=self._build_train_command(train_config),
            export_command=self._build_export_command(export_config),
            notes=preview_notes,
            extra_files=[train_config_path, export_config_path, eval_plan_path, notes_path],
            meta={
                **train_config,
                "preview_only": True,
                "dataset_exists": dataset_path.exists(),
                "dataset_path": str(dataset_path),
                "export_config": export_config,
                "eval_plan": eval_plan,
            },
        )

    def requires_training(self, context: RunContext) -> bool:
        return False

    def can_export(self, context: RunContext) -> bool:
        return False

    def _build_train_config(
        self,
        context: RunContext,
        profile: dict[str, Any],
        overrides: dict[str, Any],
        dataset_path: Path,
    ) -> dict[str, Any]:
        output_adapter_dir = context.output_dir / "adapter"
        config = dict(profile)
        config.update(
            {
                "model": context.experiment.base_model,
                "dataset": [str(dataset_path)],
                "template": overrides.get("template", self._DEFAULT_TEMPLATE),
                "output_dir": str(output_adapter_dir),
                "logging_dir": str(context.log_dir),
                "preview_only": True,
                "future_runner": "wsl-ms-swift",
                "recommended_evalset_version": context.experiment.evalset_version,
            }
        )
        config.update(overrides)
        config["preview_only"] = True
        return config

    def _build_export_config(self, context: RunContext) -> dict[str, Any]:
        return {
            "model": context.experiment.base_model,
            "adapters": str(context.output_dir / "adapter"),
            "merge_lora": True,
            "output_dir": str(context.output_dir / "merged"),
            "preview_only": True,
        }

    def _build_eval_plan(self, context: RunContext) -> dict[str, Any]:
        eval_root = context.settings.datasets_root / context.experiment.evalset_version
        return {
            "evaluation_backend": "ollama",
            "evalset_version": context.experiment.evalset_version,
            "eval_file": str(eval_root / "eval.jsonl"),
            "benchmark_file": str(eval_root / "benchmark.jsonl"),
            "smoke_eval_file": str(eval_root / "smoke_eval.jsonl"),
            "notes": [
                "This is a future evaluation handoff for the ms-swift phase.",
                "After training/export and Ollama registration are available, reuse these dataset paths for eval/benchmark.",
            ],
        }

    def _resolve_swift_dataset_path(self, dataset_dir: Path, dataset_version: str) -> Path:
        candidates = [
            dataset_dir / f"{dataset_version}.jsonl",
            dataset_dir / "train.jsonl",
            dataset_dir / f"{dataset_version}.json",
        ]
        for candidate in candidates:
            if candidate.exists():
                return candidate
        return candidates[0]

    def _build_train_command(self, config: dict[str, Any]) -> str:
        return self._build_command("swift sft", config, ordered_keys=[
            "model",
            "dataset",
            "train_type",
            "template",
            "max_length",
            "num_train_epochs",
            "per_device_train_batch_size",
            "gradient_accumulation_steps",
            "lora_rank",
            "lora_alpha",
            "target_modules",
            "output_dir",
        ])

    def _build_export_command(self, config: dict[str, Any]) -> str:
        return self._build_command("swift export", config, ordered_keys=[
            "model",
            "adapters",
            "merge_lora",
            "output_dir",
        ])

    def _build_command(self, prefix: str, payload: dict[str, Any], ordered_keys: list[str]) -> str:
        parts = [prefix]
        for key in ordered_keys:
            if key not in payload:
                continue
            value = payload[key]
            if isinstance(value, list):
                for item in value:
                    parts.append(f"--{key} {item}")
                continue
            if isinstance(value, bool):
                value = str(value).lower()
            parts.append(f"--{key} {value}")
        return " ".join(parts)
