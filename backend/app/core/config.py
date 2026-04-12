from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, Field


REPO_ROOT = Path(__file__).resolve().parents[3]
CONFIG_ROOT = REPO_ROOT / "config"


def _load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise ValueError(f"Config file must contain a mapping: {path}")
    return data


def _deep_merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


class Settings(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    app_name: str = "ai-trains"
    env: str = "dev"
    host: str = "127.0.0.1"
    port: int = 18080
    log_level: str = "INFO"

    database_url: str = "sqlite:///E:/ai/ai_trains/runtime/sqlite/app.db"

    project_root: Path = REPO_ROOT
    env_root: Path = Path("E:/") / ".env_trains"
    wsl_root: Path = Path("E:/") / "wsl"

    runtime_root: Path = REPO_ROOT / "runtime"
    sqlite_root: Path = REPO_ROOT / "runtime" / "sqlite"
    datasets_root: Path = REPO_ROOT / "runtime" / "datasets"
    templates_root: Path = REPO_ROOT / "runtime" / "templates"
    experiments_root: Path = REPO_ROOT / "runtime" / "experiments"
    runs_root: Path = REPO_ROOT / "runtime" / "runs"
    artifacts_root: Path = REPO_ROOT / "runtime" / "artifacts"
    logs_root: Path = REPO_ROOT / "runtime" / "logs"
    reports_root: Path = REPO_ROOT / "runtime" / "reports"
    pip_cache_root: Path = Path("E:/") / ".env_trains" / "cache" / "pip"
    huggingface_cache_root: Path = Path("E:/") / ".env_trains" / "cache" / "huggingface"
    torch_cache_root: Path = Path("E:/") / ".env_trains" / "cache" / "torch"
    npm_cache_root: Path = Path("E:/") / ".env_trains" / "cache" / "npm"
    modelscope_cache_root: Path = Path("E:/") / ".env_trains" / "cache" / "modelscope"
    tmp_root: Path = Path("E:/") / ".env_trains" / "tmp"
    ollama_models_root: Path = Path("E:/") / ".env_trains" / "cache" / "ollama"
    llamafactory_cli_path: Path = Path("E:/") / ".env_trains" / "venvs" / "lf-py311" / "Scripts" / "llamafactory-cli.exe"
    ollama_cli_path: str = "ollama"

    default_trainer_backend: str = "llamafactory"
    default_inference_backend: str = "ollama"
    max_concurrent_train_runs: int = 1
    max_concurrent_eval_runs: int = 2

    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_timeout_seconds: int = 300
    ollama_keep_alive: str = "10m"

    trainer_profiles: dict[str, Any] = Field(default_factory=dict)
    inference_profiles: dict[str, Any] = Field(default_factory=dict)

    def ensure_runtime_dirs(self) -> None:
        for path in (
            self.runtime_root,
            self.sqlite_root,
            self.datasets_root,
            self.templates_root,
            self.experiments_root,
            self.runs_root,
            self.artifacts_root,
            self.logs_root,
            self.reports_root,
            self.pip_cache_root,
            self.huggingface_cache_root,
            self.huggingface_cache_root / "hub",
            self.huggingface_cache_root / "transformers",
            self.torch_cache_root,
            self.npm_cache_root,
            self.modelscope_cache_root,
            self.tmp_root,
            self.ollama_models_root,
        ):
            path.mkdir(parents=True, exist_ok=True)

    def build_cache_env(self) -> dict[str, str]:
        hf_hub_cache_root = self.huggingface_cache_root / "hub"
        transformers_cache_root = self.huggingface_cache_root / "transformers"
        xdg_cache_root = self.env_root / "cache"
        return {
            "PIP_CACHE_DIR": str(self.pip_cache_root),
            "HF_HOME": str(self.huggingface_cache_root),
            "HF_HUB_CACHE": str(hf_hub_cache_root),
            "HUGGINGFACE_HUB_CACHE": str(hf_hub_cache_root),
            "TRANSFORMERS_CACHE": str(transformers_cache_root),
            "TORCH_HOME": str(self.torch_cache_root),
            "MODELSCOPE_CACHE": str(self.modelscope_cache_root),
            "TMP": str(self.tmp_root),
            "TEMP": str(self.tmp_root),
            "XDG_CACHE_HOME": str(xdg_cache_root),
            "OLLAMA_MODELS": str(self.ollama_models_root),
        }


def _build_settings() -> Settings:
    app_path = Path(os.getenv("APP_CONFIG", CONFIG_ROOT / "app.example.yaml"))
    paths_path = Path(os.getenv("PATHS_CONFIG", CONFIG_ROOT / "paths.example.yaml"))
    trainer_path = Path(os.getenv("TRAINER_CONFIG", CONFIG_ROOT / "trainer.example.yaml"))

    app_config = _load_yaml(app_path)
    paths_config = _load_yaml(paths_path)
    trainer_config = _load_yaml(trainer_path)

    merged = _deep_merge(app_config, paths_config)
    merged = _deep_merge(merged, trainer_config)

    app_section = merged.get("app", {})
    db_section = merged.get("database", {})
    runtime_section = merged.get("runtime", {})
    ollama_section = merged.get("ollama", {})
    paths_section = merged.get("paths", {})

    settings = Settings(
        app_name=app_section.get("name", "ai-trains"),
        env=app_section.get("env", "dev"),
        host=app_section.get("host", "127.0.0.1"),
        port=app_section.get("port", 18080),
        log_level=app_section.get("log_level", "INFO"),
        database_url=db_section.get("url", "sqlite:///E:/ai/ai_trains/runtime/sqlite/app.db"),
        project_root=Path(paths_section.get("project_root", REPO_ROOT)),
        env_root=Path(paths_section.get("env_root", "E:/.env_trains")),
        wsl_root=Path(paths_section.get("wsl_root", "E:/wsl")),
        runtime_root=Path(paths_section.get("runtime_root", REPO_ROOT / "runtime")),
        sqlite_root=Path(paths_section.get("sqlite_root", REPO_ROOT / "runtime" / "sqlite")),
        datasets_root=Path(paths_section.get("datasets_root", REPO_ROOT / "runtime" / "datasets")),
        templates_root=Path(paths_section.get("templates_root", REPO_ROOT / "runtime" / "templates")),
        experiments_root=Path(paths_section.get("experiments_root", REPO_ROOT / "runtime" / "experiments")),
        runs_root=Path(paths_section.get("runs_root", REPO_ROOT / "runtime" / "runs")),
        artifacts_root=Path(paths_section.get("artifacts_root", REPO_ROOT / "runtime" / "artifacts")),
        logs_root=Path(paths_section.get("logs_root", REPO_ROOT / "runtime" / "logs")),
        reports_root=Path(paths_section.get("reports_root", REPO_ROOT / "runtime" / "reports")),
        pip_cache_root=Path(paths_section.get("pip_cache_root", "E:/.env_trains/cache/pip")),
        huggingface_cache_root=Path(
            paths_section.get("huggingface_cache_root", "E:/.env_trains/cache/huggingface")
        ),
        torch_cache_root=Path(paths_section.get("torch_cache_root", "E:/.env_trains/cache/torch")),
        npm_cache_root=Path(paths_section.get("npm_cache_root", "E:/.env_trains/cache/npm")),
        modelscope_cache_root=Path(
            paths_section.get("modelscope_cache_root", "E:/.env_trains/cache/modelscope")
        ),
        tmp_root=Path(paths_section.get("tmp_root", "E:/.env_trains/tmp")),
        ollama_models_root=Path(paths_section.get("ollama_models_root", "E:/.env_trains/cache/ollama")),
        llamafactory_cli_path=Path(
            paths_section.get(
                "llamafactory_cli_path",
                Path("E:/") / ".env_trains" / "venvs" / "lf-py311" / "Scripts" / "llamafactory-cli.exe",
            )
        ),
        ollama_cli_path=str(paths_section.get("ollama_cli_path", "ollama")),
        default_trainer_backend=runtime_section.get("default_trainer_backend", "llamafactory"),
        default_inference_backend=runtime_section.get("default_inference_backend", "ollama"),
        max_concurrent_train_runs=runtime_section.get("max_concurrent_train_runs", 1),
        max_concurrent_eval_runs=runtime_section.get("max_concurrent_eval_runs", 2),
        ollama_base_url=ollama_section.get("base_url", "http://127.0.0.1:11434"),
        ollama_timeout_seconds=ollama_section.get("timeout_seconds", 300),
        ollama_keep_alive=ollama_section.get("keep_alive", "10m"),
        trainer_profiles=merged.get("trainer_profiles", {}),
        inference_profiles=merged.get("inference_profiles", {}),
    )
    settings.ensure_runtime_dirs()
    return settings


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return _build_settings()
