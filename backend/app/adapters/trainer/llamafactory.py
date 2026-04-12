from __future__ import annotations

from typing import Any

import yaml

from app.adapters.trainer.base import BaseTrainerAdapter, PreparedRun, RunContext
from app.core.json_utils import loads_json


class LLaMAFactoryTrainerAdapter(BaseTrainerAdapter):
    name = "llamafactory"
    _LOCAL_ONLY_KEYS = {
        "use_modelscope_hub",
    }

    def prepare(self, context: RunContext) -> PreparedRun:
        if context.experiment.route_type == "baseline_infer":
            notes_path = context.input_dir / "baseline_infer.txt"
            notes_path.write_text(
                "Baseline inference route does not require training. "
                "Use Ollama registration and offline evaluation only.\n",
                encoding="utf-8",
            )
            return PreparedRun(
                trainer_backend=self.name,
                route_type=context.experiment.route_type,
                notes=["No training step is required for baseline inference."],
                extra_files=[notes_path],
            )

        profile = context.settings.trainer_profiles.get("llamafactory", {}).get("sft_default", {})
        overrides = loads_json(context.experiment.train_config_json, {})
        local_options = self._extract_local_options(overrides)
        merged_config = self._build_config(context, profile, overrides)

        train_config_path = context.input_dir / "llamafactory.train.yaml"
        export_config_path = context.input_dir / "llamafactory.export.yaml"

        with train_config_path.open("w", encoding="utf-8") as handle:
            yaml.safe_dump(merged_config, handle, allow_unicode=False, sort_keys=False)

        export_config = {
            "model_name_or_path": context.experiment.base_model,
            "adapter_name_or_path": str(context.output_dir / "adapter"),
            "template": merged_config["template"],
            "finetuning_type": merged_config.get("finetuning_type", "lora"),
            "trust_remote_code": merged_config.get("trust_remote_code", True),
            "export_dir": str(context.output_dir / "merged"),
            "export_device": overrides.get("export_device", "cpu"),
            "export_size": overrides.get("export_size", 2),
            "export_legacy_format": overrides.get("export_legacy_format", False),
        }
        with export_config_path.open("w", encoding="utf-8") as handle:
            yaml.safe_dump(export_config, handle, allow_unicode=False, sort_keys=False)

        return PreparedRun(
            trainer_backend=self.name,
            route_type=context.experiment.route_type,
            train_config_path=train_config_path,
            export_config_path=export_config_path,
            train_command=f"llamafactory-cli train {train_config_path}",
            export_command=f"llamafactory-cli export {export_config_path}",
            train_command_args=[
                str(context.settings.llamafactory_cli_path),
                "train",
                str(train_config_path),
            ],
            export_command_args=[
                str(context.settings.llamafactory_cli_path),
                "export",
                str(export_config_path),
            ],
            train_env=self._build_command_env(context.settings, local_options),
            export_env=self._build_command_env(context.settings, local_options),
            notes=[
                "Windows default keeps dataloader_num_workers at 0 for stability.",
                "Worker can execute train/export directly when llamafactory-cli is installed.",
            ],
            extra_files=[train_config_path, export_config_path],
            meta=merged_config,
        )

    def _build_config(
        self,
        context: RunContext,
        profile: dict[str, Any],
        overrides: dict[str, Any],
    ) -> dict[str, Any]:
        dataset_dir = context.settings.datasets_root / context.experiment.dataset_version
        output_adapter_dir = context.output_dir / "adapter"
        config = dict(profile)
        config.update(
            {
                "model_name_or_path": context.experiment.base_model,
                "dataset_dir": str(dataset_dir),
                "dataset": context.experiment.dataset_version,
                "template": overrides.get("template", "qwen"),
                "output_dir": str(output_adapter_dir),
                "logging_dir": str(context.log_dir),
                "report_to": overrides.get("report_to", "none"),
                "overwrite_output_dir": True,
                "dataloader_num_workers": 0,
                "do_train": True,
                "trust_remote_code": True,
            }
        )
        for key, value in overrides.items():
            if key not in self._LOCAL_ONLY_KEYS:
                config[key] = value
        return config

    def _extract_local_options(self, overrides: dict[str, Any]) -> dict[str, Any]:
        return {key: overrides.get(key) for key in self._LOCAL_ONLY_KEYS if key in overrides}

    def _build_command_env(self, settings, local_options: dict[str, Any]) -> dict[str, str]:
        env = settings.build_cache_env()
        if local_options.get("use_modelscope_hub"):
            env["USE_MODELSCOPE_HUB"] = "1"
        return env
