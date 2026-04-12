from __future__ import annotations

import argparse
import logging
import shutil
import time
from pathlib import Path
from typing import Any

from sqlmodel import Session

from app.adapters.inference.ollama import (
    OllamaClient,
    sanitize_model_name,
    write_modelfile,
)
from app.adapters.trainer import get_trainer_adapter
from app.adapters.trainer.base import RunContext
from app.core.config import get_settings
from app.core.ids import utcnow
from app.core.json_utils import dumps_json, loads_json
from app.core.subprocess_utils import run_and_log
from app.db.session import engine, init_db
from app.models.entities import Artifact, Experiment, Metric, Run
from app.reports.run_report import build_run_report
from app.services.ollama_eval import run_benchmark_suite, run_eval_suite
from app.services.runs import list_pending_runs


LOGGER = logging.getLogger("ai_trains.worker")

CONVERTER_GGUF_OUTTYPES = {"f32", "f16", "bf16", "q8_0", "tq1_0", "tq2_0", "auto"}
QUANTIZE_GGUF_OUTTYPES = {
    "q2_k",
    "q3_k",
    "q4_0",
    "q4_1",
    "q4_k",
    "q4_k_m",
    "q4_k_s",
    "q5_0",
    "q5_1",
    "q5_k",
    "q5_k_m",
    "q5_k_s",
    "q6_k",
    "iq1_m",
    "iq1_s",
    "iq2_s",
    "iq2_xs",
    "iq2_xxs",
    "iq3_xxs",
    "iq4_nl",
    "iq4_xs",
    "copy",
}


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )


def _step_dirs(run_dir: Path) -> tuple[Path, Path, Path]:
    input_dir = run_dir / "input"
    output_dir = run_dir / "output"
    log_dir = run_dir / "logs"
    for path in (input_dir, output_dir, log_dir, run_dir / "eval", run_dir / "benchmark"):
        path.mkdir(parents=True, exist_ok=True)
    return input_dir, output_dir, log_dir


def _write_artifact(
    session: Session, run_id: str, artifact_type: str, file_path: Path, meta: dict | None = None
) -> None:
    session.add(
        Artifact(
            run_id=run_id,
            artifact_type=artifact_type,
            file_path=str(file_path),
            meta_json=dumps_json(meta or {}),
        )
    )


def _write_metric(
    session: Session, run_id: str, group: str, name: str, value: float, extra: dict | None = None
) -> None:
    session.add(
        Metric(
            run_id=run_id,
            metric_group=group,
            metric_name=name,
            metric_value=value,
            metric_extra_json=dumps_json(extra or {}),
        )
    )


def _append_worker_log(log_path: Path, message: str) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(f"{utcnow().isoformat()} {message}\n")


def _append_pipeline_log(
    log_path: Path,
    *,
    step: str,
    status: str,
    detail: str,
    steps: list[dict[str, Any]] | None = None,
    summary_path: Path | None = None,
) -> None:
    timestamp = utcnow().isoformat()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(f"{timestamp} [{status}] {step}: {detail}\n")

    if steps is None:
        return

    entry = {
        "timestamp": timestamp,
        "step": step,
        "status": status,
        "detail": detail,
    }
    steps.append(entry)
    if summary_path is not None:
        summary_path.write_text(dumps_json({"steps": steps}), encoding="utf-8")


def _detect_gguf_status(
    *,
    experiment: Experiment,
    output_dir: Path,
    infer_config: dict[str, Any],
) -> tuple[str, str, Path | None]:
    configured_gguf_path = infer_config.get("gguf_path")
    if configured_gguf_path:
        gguf_path = Path(str(configured_gguf_path))
        if gguf_path.exists():
            return "COMPLETED", f"path={gguf_path}", gguf_path
        return "BLOCKED", f"configured gguf_path not found path={gguf_path}", None

    local_gguf = output_dir / "model.gguf"
    if local_gguf.exists():
        return "COMPLETED", f"path={local_gguf}", local_gguf

    if infer_config.get("ollama_registered_model") or infer_config.get("ollama_from_model"):
        return "SKIPPED", "reusing existing Ollama model; GGUF conversion not required", None

    merged_dir = output_dir / "merged"
    if merged_dir.exists():
        if experiment.trainer_backend == "swift":
            return "PLANNED", f"merged model is ready for future ms-swift handoff. merged_dir={merged_dir}", None
        return "PLANNED", (
            "merged model is ready; enable infer_config.auto_gguf=true "
            f"or provide gguf_path manually. merged_dir={merged_dir}"
        ), None

    return "SKIPPED", "no merged model or GGUF artifact detected", None


def _detect_vllm_status(
    *,
    output_dir: Path,
    infer_config: dict[str, Any],
) -> tuple[str, str]:
    if infer_config.get("skip_vllm"):
        return "SKIPPED", "infer_config.skip_vllm=true"

    merged_dir = output_dir / "merged"
    if merged_dir.exists():
        served_model_name = infer_config.get("vllm_served_model_name") or infer_config.get("vllm_model_name")
        served_suffix = f" served_model={served_model_name}" if served_model_name else ""
        return "PLANNED", f"merged model is ready for vLLM serve. model_dir={merged_dir}{served_suffix}"

    return "SKIPPED", "no merged model directory available for vLLM"


def _should_run_gguf_conversion(infer_config: dict[str, Any]) -> bool:
    if infer_config.get("skip_gguf", False):
        return False
    if infer_config.get("gguf_path"):
        return False
    return bool(infer_config.get("auto_gguf", not infer_config.get("skip_ollama", False)))


def _normalize_gguf_outtype(value: Any, *, default: str) -> str:
    raw = str(value or default).strip().lower()
    return raw or default


def _requires_quantize_step(gguf_outtype: str) -> bool:
    return gguf_outtype not in CONVERTER_GGUF_OUTTYPES


def _resolve_gguf_intermediate_path(target_path: Path) -> Path:
    suffixes = "".join(target_path.suffixes) or ".gguf"
    stem = target_path.name[: -len(suffixes)] if suffixes and target_path.name.endswith(suffixes) else target_path.stem
    return target_path.with_name(f"{stem}.f16{suffixes}")


def _resolve_llama_quantize_path(settings, infer_config: dict[str, Any]) -> Path | None:
    explicit = infer_config.get("gguf_quantize_cli_path")
    candidates = [
        Path(str(explicit)) if explicit else None,
        settings.gguf_quantize_cli_path,
        settings.llama_cpp_root / "build" / "bin" / "Release" / "llama-quantize.exe",
        settings.llama_cpp_root / "build" / "bin" / "Debug" / "llama-quantize.exe",
        settings.llama_cpp_root / "build" / "bin" / "llama-quantize.exe",
    ]
    for candidate in candidates:
        if candidate is not None and candidate.exists():
            return candidate
    return None


def _run_hf_to_gguf_conversion(
    *,
    settings,
    merged_dir: Path,
    target_path: Path,
    outtype: str,
    log_path: Path,
    infer_config: dict[str, Any],
) -> None:
    converter_script = Path(
        str(infer_config.get("gguf_converter_script_path", settings.gguf_converter_script_path))
    )
    if not converter_script.exists():
        raise RuntimeError(
            "GGUF converter script not found. "
            f"Expected: {converter_script}. "
            "Install llama.cpp under E:\\.env_trains\\src\\llama.cpp or set infer_config.gguf_converter_script_path."
        )

    python_executable = Path(str(infer_config.get("gguf_python_path", settings.worker_python_path)))
    if not python_executable.exists():
        raise RuntimeError(
            "Python executable for GGUF conversion not found. "
            f"Expected: {python_executable}. "
            "Set paths.worker_python_path or infer_config.gguf_python_path."
        )

    run_and_log(
        command=[
            str(python_executable),
            str(converter_script),
            str(merged_dir),
            "--outfile",
            str(target_path),
            "--outtype",
            outtype,
        ],
        cwd=target_path.parent,
        log_path=log_path,
        env=settings.build_cache_env(),
    )


def _run_gguf_quantize(
    *,
    settings,
    source_path: Path,
    target_path: Path,
    quantize_type: str,
    log_path: Path,
    infer_config: dict[str, Any],
) -> None:
    quantize_cli = _resolve_llama_quantize_path(settings, infer_config)
    if quantize_cli is None:
        raise RuntimeError(
            "Requested quantized GGUF output requires llama-quantize.exe, but it was not found. "
            "Phase-1 Windows defaults should use gguf_outtype=f16. "
            "If you need q4_k_m, build llama.cpp tools first and set paths.gguf_quantize_cli_path."
        )

    command = [
        str(quantize_cli),
        str(source_path),
        str(target_path),
        quantize_type.upper(),
    ]
    quantize_threads = infer_config.get("gguf_quantize_threads")
    if quantize_threads:
        command.append(str(quantize_threads))

    run_and_log(
        command=command,
        cwd=target_path.parent,
        log_path=log_path,
        env=settings.build_cache_env(),
    )


def _resolve_gguf_output_path(settings, run: Run, infer_config: dict[str, Any], output_dir: Path) -> Path:
    if infer_config.get("gguf_output_path"):
        return Path(str(infer_config["gguf_output_path"]))
    if infer_config.get("gguf_artifact_path"):
        return Path(str(infer_config["gguf_artifact_path"]))
    artifact_name = infer_config.get("gguf_artifact_name")
    if artifact_name:
        return settings.gguf_artifacts_root / str(artifact_name)
    return output_dir / "model.gguf"


def _convert_gguf_model(
    *,
    settings,
    experiment: Experiment,
    run: Run,
    run_dir: Path,
    output_dir: Path,
    infer_config: dict[str, Any],
) -> tuple[Path | None, list[Path], str]:
    if not _should_run_gguf_conversion(infer_config):
        return None, [], "GGUF conversion skipped by infer_config or pre-supplied gguf_path."

    merged_dir = output_dir / "merged"
    _require_path(merged_dir, "gguf_convert")

    local_gguf = output_dir / "model.gguf"
    target_path = _resolve_gguf_output_path(settings, run, infer_config, output_dir)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    if target_path.exists() and not infer_config.get("force_gguf_rebuild", False):
        if target_path.resolve() != local_gguf.resolve():
            local_gguf.parent.mkdir(parents=True, exist_ok=True)
            if not local_gguf.exists():
                shutil.copyfile(target_path, local_gguf)
        return local_gguf if local_gguf.exists() else target_path, [], f"reuse existing gguf path={target_path}"

    requested_outtype = _normalize_gguf_outtype(
        infer_config.get("gguf_outtype", settings.gguf_default_outtype),
        default=settings.gguf_default_outtype,
    )
    if requested_outtype not in CONVERTER_GGUF_OUTTYPES and requested_outtype not in QUANTIZE_GGUF_OUTTYPES:
        raise RuntimeError(
            f"Unsupported gguf_outtype={requested_outtype}. "
            "Use one of the llama.cpp convert outtypes or a supported quantize type such as q4_k_m."
        )

    converter_outtype = requested_outtype
    convert_target_path = target_path
    gguf_log_paths: list[Path] = []
    gguf_convert_log_path = run_dir / "logs" / "gguf-convert.log"
    if _requires_quantize_step(requested_outtype):
        converter_outtype = _normalize_gguf_outtype(
            infer_config.get("gguf_intermediate_outtype", "f16"),
            default="f16",
        )
        if converter_outtype not in CONVERTER_GGUF_OUTTYPES:
            raise RuntimeError(
                "infer_config.gguf_intermediate_outtype must be one of: "
                f"{', '.join(sorted(CONVERTER_GGUF_OUTTYPES))}"
            )
        convert_target_path = _resolve_gguf_intermediate_path(target_path)

    _run_hf_to_gguf_conversion(
        settings=settings,
        merged_dir=merged_dir,
        target_path=convert_target_path,
        outtype=converter_outtype,
        log_path=gguf_convert_log_path,
        infer_config=infer_config,
    )
    gguf_log_paths.append(gguf_convert_log_path)

    detail = f"generated gguf path={target_path} outtype={requested_outtype}"
    if _requires_quantize_step(requested_outtype):
        gguf_quantize_log_path = run_dir / "logs" / "gguf-quantize.log"
        _run_gguf_quantize(
            settings=settings,
            source_path=convert_target_path,
            target_path=target_path,
            quantize_type=requested_outtype,
            log_path=gguf_quantize_log_path,
            infer_config=infer_config,
        )
        gguf_log_paths.append(gguf_quantize_log_path)
        detail = (
            f"generated gguf path={target_path} outtype={requested_outtype} "
            f"via intermediate_outtype={converter_outtype}"
        )
        if not infer_config.get("keep_intermediate_gguf", False) and convert_target_path.exists():
            convert_target_path.unlink()

    if target_path.resolve() != local_gguf.resolve():
        local_gguf.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(target_path, local_gguf)

    return local_gguf, gguf_log_paths, detail


def _require_command(command_args: list[str] | None, stage: str) -> list[str]:
    if not command_args:
        raise RuntimeError(f"No command arguments provided for stage: {stage}")
    return command_args


def _require_path(path: Path, stage: str) -> Path:
    if not path.exists():
        raise RuntimeError(f"Required path not found for stage {stage}: {path}")
    return path


def _build_ollama_model_name(experiment: Experiment, run: Run) -> str:
    base_ref = experiment.base_model.split("/")[-1]
    raw = f"alarm-{experiment.trainer_backend}-{base_ref}-{run.id}"
    return sanitize_model_name(raw)


def _resolve_eval_paths(settings, experiment: Experiment, infer_config: dict[str, Any], run_dir: Path) -> tuple[Path, Path]:
    dataset_root = settings.datasets_root / experiment.evalset_version
    eval_file = infer_config.get("eval_file", "eval.jsonl")
    benchmark_file = infer_config.get("benchmark_file", "benchmark.jsonl")
    return dataset_root / eval_file, dataset_root / benchmark_file


def _resolve_ollama_from_ref(experiment: Experiment, run: Run, output_dir: Path, infer_config: dict[str, Any]) -> str:
    if infer_config.get("ollama_registered_model"):
        return str(infer_config["ollama_registered_model"])
    if infer_config.get("ollama_from_model"):
        return str(infer_config["ollama_from_model"])
    if infer_config.get("gguf_path"):
        gguf_path = Path(str(infer_config["gguf_path"]))
        _require_path(gguf_path, "ollama_register")
        return gguf_path.resolve().as_posix()
    if experiment.route_type != "baseline_infer":
        local_gguf = output_dir / "model.gguf"
        if local_gguf.exists():
            return local_gguf.resolve().as_posix()
        raise RuntimeError(
            "No GGUF path available for Ollama registration. "
            "Set infer_config.gguf_path or place model.gguf in the run output directory."
        )
    raise RuntimeError(
        "Baseline inference requires infer_config.ollama_registered_model "
        "or infer_config.ollama_from_model."
    )


def _register_ollama_model(
    *,
    settings,
    experiment: Experiment,
    run: Run,
    run_dir: Path,
    output_dir: Path,
    infer_config: dict[str, Any],
) -> tuple[str, Path]:
    model_name = infer_config.get("ollama_model_name") or _build_ollama_model_name(experiment, run)
    from_ref = _resolve_ollama_from_ref(experiment, run, output_dir, infer_config)
    system_prompt = infer_config.get("system_prompt")
    parameters = infer_config.get("parameters", {})

    modelfile_path = run_dir / "output" / "Modelfile"
    write_modelfile(
        output_path=modelfile_path,
        from_ref=from_ref,
        system_prompt=system_prompt,
        parameters=parameters,
    )

    ollama_log_path = run_dir / "logs" / "ollama-create.log"
    command = [
        settings.ollama_cli_path,
        "create",
        str(model_name),
        "-f",
        str(modelfile_path),
    ]
    run_and_log(command=command, cwd=run_dir, log_path=ollama_log_path)
    return str(model_name), modelfile_path


def process_run(run_id: str) -> None:
    settings = get_settings()
    with Session(engine) as session:
        run = session.get(Run, run_id)
        if run is None:
            LOGGER.warning("Run not found: %s", run_id)
            return
        experiment = session.get(Experiment, run.experiment_id)
        if experiment is None:
            LOGGER.warning("Experiment not found for run: %s", run_id)
            run.status = "failed"
            run.error_message = "Experiment not found."
            run.finished_at = utcnow()
            session.add(run)
            session.commit()
            return

        run_dir = settings.runs_root / run.id
        _, _, log_dir = _step_dirs(run_dir)
        log_path = log_dir / "worker.log"
        pipeline_log_path = log_dir / "automation_pipeline.log"
        pipeline_summary_path = log_dir / "automation_pipeline.json"
        pipeline_steps: list[dict[str, Any]] = []
        _append_pipeline_log(
            pipeline_log_path,
            step="RUN",
            status="STARTED",
            detail=(
                f"run_id={run.id} experiment_id={run.experiment_id} "
                f"trainer_backend={experiment.trainer_backend} route_type={experiment.route_type}"
            ),
            steps=pipeline_steps,
            summary_path=pipeline_summary_path,
        )

        run.status = "running"
        run.current_step = "prepare"
        run.started_at = utcnow()
        run.output_dir = str(run_dir)
        run.log_path = str(log_path)
        _append_worker_log(log_path, f"Run picked by worker. experiment_id={run.experiment_id}")
        experiment.status = "running"
        experiment.updated_at = utcnow()
        session.add(run)
        session.add(experiment)
        session.commit()

    try:
        with Session(engine) as session:
            run = session.get(Run, run_id)
            experiment = session.get(Experiment, run.experiment_id)
            run_dir = settings.runs_root / run.id
            input_dir, output_dir, log_dir = _step_dirs(run_dir)
            context = RunContext(
                settings=settings,
                experiment=experiment,
                run=run,
                run_dir=run_dir,
                input_dir=input_dir,
                output_dir=output_dir,
                log_dir=log_dir,
            )
            adapter = get_trainer_adapter(experiment.trainer_backend)
            prepared = adapter.prepare(context)
            infer_config = loads_json(experiment.infer_config_json, {})

            manifest_path = run_dir / "input" / "run_manifest.json"
            manifest_path.write_text(
                dumps_json(
                    {
                        "experiment_id": experiment.id,
                        "run_id": run.id,
                        "trainer_backend": experiment.trainer_backend,
                        "route_type": experiment.route_type,
                        "base_model": experiment.base_model,
                    }
                ),
                encoding="utf-8",
            )
            _write_artifact(session, run.id, "worker_log", log_path)
            _write_artifact(session, run.id, "automation_pipeline_log", pipeline_log_path)
            _write_artifact(session, run.id, "automation_pipeline_summary", pipeline_summary_path)
            _write_artifact(session, run.id, "run_manifest", manifest_path)

            for file_path in prepared.extra_files:
                artifact_type = "prepared_file"
                if file_path.name.endswith(".train.yaml"):
                    artifact_type = "train_config"
                elif file_path.name.endswith(".export.yaml"):
                    artifact_type = "export_config"
                _write_artifact(session, run.id, artifact_type, file_path)

            preview_path = run_dir / "output" / "command_preview.json"
            preview_payload = {
                "train_command": prepared.train_command,
                "export_command": prepared.export_command,
                "notes": prepared.notes,
                "meta": prepared.meta,
            }
            preview_path.write_text(dumps_json(preview_payload), encoding="utf-8")
            _write_artifact(session, run.id, "command_preview", preview_path)
            _append_worker_log(log_path, f"Prepare finished. trainer_backend={prepared.trainer_backend}")
            _append_pipeline_log(
                pipeline_log_path,
                step="PREPARE",
                status="COMPLETED",
                detail=f"trainer_backend={prepared.trainer_backend} preview_path={preview_path}",
                steps=pipeline_steps,
                summary_path=pipeline_summary_path,
            )

            session.commit()

            train_log_path = log_dir / "train.log"
            export_log_path = log_dir / "export.log"

            if adapter.requires_training(context):
                run.current_step = "train"
                session.add(run)
                session.commit()

                train_command = _require_command(prepared.train_command_args, "train")
                _write_artifact(session, run.id, "train_log", train_log_path)
                session.commit()
                _append_worker_log(log_path, f"Train step started. log={train_log_path}")
                _append_pipeline_log(
                    pipeline_log_path,
                    step="TRAIN",
                    status="STARTED",
                    detail=f"log={train_log_path}",
                    steps=pipeline_steps,
                    summary_path=pipeline_summary_path,
                )
                run_and_log(
                    command=train_command,
                    cwd=context.run_dir,
                    log_path=train_log_path,
                    env=prepared.train_env,
                )
                adapter_dir = output_dir / "adapter"
                if adapter_dir.exists():
                    _write_artifact(session, run.id, "adapter_dir", adapter_dir)
                _append_worker_log(log_path, f"Train step completed. adapter_dir={adapter_dir}")
                _append_pipeline_log(
                    pipeline_log_path,
                    step="TRAIN",
                    status="COMPLETED",
                    detail=f"adapter_dir={adapter_dir}",
                    steps=pipeline_steps,
                    summary_path=pipeline_summary_path,
                )
                _write_metric(session, run.id, "train", "train_executed", 1.0)
                session.commit()
            else:
                _append_worker_log(log_path, "Train step skipped for baseline inference route.")
                skip_detail = "preview-only adapter does not execute train" if prepared.meta.get("preview_only") else "route does not require training"
                _append_pipeline_log(
                    pipeline_log_path,
                    step="TRAIN",
                    status="SKIPPED",
                    detail=skip_detail,
                    steps=pipeline_steps,
                    summary_path=pipeline_summary_path,
                )
                _write_metric(session, run.id, "train", "train_executed", 0.0)
                session.commit()

            if adapter.can_export(context):
                run.current_step = "export"
                session.add(run)
                session.commit()

                export_command = _require_command(prepared.export_command_args, "export")
                _write_artifact(session, run.id, "export_log", export_log_path)
                session.commit()
                _append_worker_log(log_path, f"Export step started. log={export_log_path}")
                _append_pipeline_log(
                    pipeline_log_path,
                    step="EXPORT",
                    status="STARTED",
                    detail=f"log={export_log_path}",
                    steps=pipeline_steps,
                    summary_path=pipeline_summary_path,
                )
                run_and_log(
                    command=export_command,
                    cwd=context.run_dir,
                    log_path=export_log_path,
                    env=prepared.export_env,
                )
                merged_dir = output_dir / "merged"
                if merged_dir.exists():
                    _write_artifact(session, run.id, "merged_model_dir", merged_dir)
                _append_worker_log(log_path, f"Export step completed. merged_dir={merged_dir}")
                _append_pipeline_log(
                    pipeline_log_path,
                    step="EXPORT",
                    status="COMPLETED",
                    detail=f"merged_dir={merged_dir}",
                    steps=pipeline_steps,
                    summary_path=pipeline_summary_path,
                )
                _write_metric(session, run.id, "train", "export_executed", 1.0)
                session.commit()
            else:
                _append_worker_log(log_path, "Export step skipped.")
                skip_detail = "preview-only adapter does not execute export" if prepared.meta.get("preview_only") else "adapter cannot export for this route"
                _append_pipeline_log(
                    pipeline_log_path,
                    step="EXPORT",
                    status="SKIPPED",
                    detail=skip_detail,
                    steps=pipeline_steps,
                    summary_path=pipeline_summary_path,
                )
                _write_metric(session, run.id, "train", "export_executed", 0.0)
                session.commit()

            gguf_log_path = run_dir / "logs" / "gguf-convert.log"
            gguf_path: Path | None = None
            if _should_run_gguf_conversion(infer_config):
                run.current_step = "gguf_convert"
                session.add(run)
                session.commit()
                _append_pipeline_log(
                    pipeline_log_path,
                    step="GGUF",
                    status="STARTED",
                    detail=f"log={gguf_log_path}",
                    steps=pipeline_steps,
                    summary_path=pipeline_summary_path,
                )
                try:
                    gguf_path, generated_gguf_log_paths, gguf_detail = _convert_gguf_model(
                        settings=settings,
                        experiment=experiment,
                        run=run,
                        run_dir=run_dir,
                        output_dir=output_dir,
                        infer_config=infer_config,
                    )
                except Exception as exc:
                    _append_pipeline_log(
                        pipeline_log_path,
                        step="GGUF",
                        status="FAILED",
                        detail=str(exc),
                        steps=pipeline_steps,
                        summary_path=pipeline_summary_path,
                    )
                    raise
                for generated_log_path in generated_gguf_log_paths:
                    artifact_type = "gguf_quantize_log" if "quantize" in generated_log_path.name else "gguf_convert_log"
                    _write_artifact(session, run.id, artifact_type, generated_log_path)
                if gguf_path is not None:
                    _write_artifact(session, run.id, "gguf_model", gguf_path, {"source": "llama.cpp"})
                requested_gguf_outtype = _normalize_gguf_outtype(
                    infer_config.get("gguf_outtype", settings.gguf_default_outtype),
                    default=settings.gguf_default_outtype,
                )
                _write_metric(session, run.id, "train", "gguf_executed", 1.0)
                _write_metric(
                    session,
                    run.id,
                    "train",
                    "gguf_quantized",
                    1.0 if _requires_quantize_step(requested_gguf_outtype) else 0.0,
                )
                _append_pipeline_log(
                    pipeline_log_path,
                    step="GGUF",
                    status="COMPLETED",
                    detail=gguf_detail,
                    steps=pipeline_steps,
                    summary_path=pipeline_summary_path,
                )
                session.commit()
            else:
                gguf_status, gguf_detail, gguf_path = _detect_gguf_status(
                    experiment=experiment,
                    output_dir=output_dir,
                    infer_config=infer_config,
                )
                if gguf_path is not None:
                    _write_artifact(session, run.id, "gguf_model", gguf_path)
                _write_metric(
                    session,
                    run.id,
                    "train",
                    "gguf_executed",
                    1.0 if gguf_status == "COMPLETED" else 0.0,
                )
                _write_metric(
                    session,
                    run.id,
                    "train",
                    "gguf_quantized",
                    0.0,
                )
                _append_pipeline_log(
                    pipeline_log_path,
                    step="GGUF",
                    status=gguf_status,
                    detail=gguf_detail,
                    steps=pipeline_steps,
                    summary_path=pipeline_summary_path,
                )
                session.commit()

            vllm_status, vllm_detail = _detect_vllm_status(
                output_dir=output_dir,
                infer_config=infer_config,
            )
            _append_pipeline_log(
                pipeline_log_path,
                step="VLLM_REGISTER",
                status=vllm_status,
                detail=vllm_detail,
                steps=pipeline_steps,
                summary_path=pipeline_summary_path,
            )

            ollama_summary: dict[str, Any] | None = None
            eval_summary: dict[str, Any] | None = None
            benchmark_summary: dict[str, Any] | None = None

            if not infer_config.get("skip_ollama", False):
                run.current_step = "ollama_register"
                session.add(run)
                session.commit()
                _append_pipeline_log(
                    pipeline_log_path,
                    step="OLLAMA_REGISTER",
                    status="STARTED",
                    detail="creating local Ollama model",
                    steps=pipeline_steps,
                    summary_path=pipeline_summary_path,
                )

                try:
                    model_name, modelfile_path = _register_ollama_model(
                        settings=settings,
                        experiment=experiment,
                        run=run,
                        run_dir=run_dir,
                        output_dir=output_dir,
                        infer_config=infer_config,
                    )
                except Exception as exc:
                    _append_pipeline_log(
                        pipeline_log_path,
                        step="OLLAMA_REGISTER",
                        status="FAILED",
                        detail=str(exc),
                        steps=pipeline_steps,
                        summary_path=pipeline_summary_path,
                    )
                    raise
                ollama_log_path = run_dir / "logs" / "ollama-create.log"
                _write_artifact(session, run.id, "ollama_modelfile", modelfile_path)
                _write_artifact(session, run.id, "ollama_create_log", ollama_log_path)
                _append_worker_log(log_path, f"Ollama model registered. model_name={model_name}")
                ollama_summary = {"model_name": model_name, "modelfile_path": str(modelfile_path)}
                _append_pipeline_log(
                    pipeline_log_path,
                    step="OLLAMA_REGISTER",
                    status="COMPLETED",
                    detail=f"model_name={model_name} modelfile={modelfile_path}",
                    steps=pipeline_steps,
                    summary_path=pipeline_summary_path,
                )
                _write_metric(session, run.id, "benchmark", "ollama_registered", 1.0, ollama_summary)
                session.commit()

                client = OllamaClient(
                    base_url=settings.ollama_base_url,
                    timeout_seconds=settings.ollama_timeout_seconds,
                )
                eval_path, benchmark_path = _resolve_eval_paths(settings, experiment, infer_config, run_dir)
                options = infer_config.get("options", {})
                fmt = infer_config.get("format")
                keep_alive = infer_config.get("keep_alive", settings.ollama_keep_alive)

                if not infer_config.get("skip_eval", False) and eval_path.exists():
                    run.current_step = "eval"
                    session.add(run)
                    session.commit()
                    _append_pipeline_log(
                        pipeline_log_path,
                        step="EVAL",
                        status="STARTED",
                        detail=f"dataset={eval_path}",
                        steps=pipeline_steps,
                        summary_path=pipeline_summary_path,
                    )

                    eval_output_path = run_dir / "eval" / "eval_results.jsonl"
                    try:
                        eval_summary = run_eval_suite(
                            client=client,
                            model_name=model_name,
                            dataset_path=eval_path,
                            output_path=eval_output_path,
                            options=options,
                            fmt=fmt,
                            keep_alive=keep_alive,
                        )
                    except Exception as exc:
                        _append_pipeline_log(
                            pipeline_log_path,
                            step="EVAL",
                            status="FAILED",
                            detail=str(exc),
                            steps=pipeline_steps,
                            summary_path=pipeline_summary_path,
                        )
                        raise
                    summary_path = run_dir / "eval" / "eval_summary.json"
                    summary_path.write_text(dumps_json(eval_summary), encoding="utf-8")
                    _write_artifact(session, run.id, "eval_results", eval_output_path)
                    _write_artifact(session, run.id, "eval_summary", summary_path)
                    for metric_name, metric_value in eval_summary.items():
                        if metric_value is not None:
                            _write_metric(session, run.id, "eval", metric_name, float(metric_value))
                    _append_worker_log(log_path, f"Eval step completed. summary_path={summary_path}")
                    _append_pipeline_log(
                        pipeline_log_path,
                        step="EVAL",
                        status="COMPLETED",
                        detail=(
                            f"summary_path={summary_path} "
                            f"contains_accuracy={eval_summary.get('contains_accuracy')} "
                            f"json_valid_rate={eval_summary.get('json_valid_rate')}"
                        ),
                        steps=pipeline_steps,
                        summary_path=pipeline_summary_path,
                    )
                    session.commit()
                else:
                    eval_skip_reason = (
                        "infer_config.skip_eval=true"
                        if infer_config.get("skip_eval", False)
                        else f"eval dataset not found path={eval_path}"
                    )
                    _append_pipeline_log(
                        pipeline_log_path,
                        step="EVAL",
                        status="SKIPPED",
                        detail=eval_skip_reason,
                        steps=pipeline_steps,
                        summary_path=pipeline_summary_path,
                    )

                if not infer_config.get("skip_benchmark", False) and benchmark_path.exists():
                    run.current_step = "benchmark"
                    session.add(run)
                    session.commit()
                    _append_pipeline_log(
                        pipeline_log_path,
                        step="BENCHMARK",
                        status="STARTED",
                        detail=f"dataset={benchmark_path}",
                        steps=pipeline_steps,
                        summary_path=pipeline_summary_path,
                    )

                    bench_output_path = run_dir / "benchmark" / "benchmark_results.jsonl"
                    try:
                        benchmark_summary = run_benchmark_suite(
                            client=client,
                            model_name=model_name,
                            dataset_path=benchmark_path,
                            output_path=bench_output_path,
                            options=options,
                            fmt=fmt,
                            keep_alive=keep_alive,
                        )
                    except Exception as exc:
                        _append_pipeline_log(
                            pipeline_log_path,
                            step="BENCHMARK",
                            status="FAILED",
                            detail=str(exc),
                            steps=pipeline_steps,
                            summary_path=pipeline_summary_path,
                        )
                        raise
                    summary_path = run_dir / "benchmark" / "benchmark_summary.json"
                    summary_path.write_text(dumps_json(benchmark_summary), encoding="utf-8")
                    _write_artifact(session, run.id, "benchmark_results", bench_output_path)
                    _write_artifact(session, run.id, "benchmark_summary", summary_path)
                    for metric_name, metric_value in benchmark_summary.items():
                        if metric_value is not None:
                            _write_metric(session, run.id, "benchmark", metric_name, float(metric_value))
                    _append_worker_log(log_path, f"Benchmark step completed. summary_path={summary_path}")
                    _append_pipeline_log(
                        pipeline_log_path,
                        step="BENCHMARK",
                        status="COMPLETED",
                        detail=(
                            f"summary_path={summary_path} "
                            f"avg_total_ms={benchmark_summary.get('avg_total_ms')} "
                            f"avg_eval_tokens_per_sec={benchmark_summary.get('avg_eval_tokens_per_sec')}"
                        ),
                        steps=pipeline_steps,
                        summary_path=pipeline_summary_path,
                    )
                    session.commit()
                else:
                    benchmark_skip_reason = (
                        "infer_config.skip_benchmark=true"
                        if infer_config.get("skip_benchmark", False)
                        else f"benchmark dataset not found path={benchmark_path}"
                    )
                    _append_pipeline_log(
                        pipeline_log_path,
                        step="BENCHMARK",
                        status="SKIPPED",
                        detail=benchmark_skip_reason,
                        steps=pipeline_steps,
                        summary_path=pipeline_summary_path,
                    )
            else:
                _append_pipeline_log(
                    pipeline_log_path,
                    step="OLLAMA_REGISTER",
                    status="SKIPPED",
                    detail="infer_config.skip_ollama=true",
                    steps=pipeline_steps,
                    summary_path=pipeline_summary_path,
                )
                _append_pipeline_log(
                    pipeline_log_path,
                    step="EVAL",
                    status="SKIPPED",
                    detail="offline eval depends on Ollama registration in phase 1",
                    steps=pipeline_steps,
                    summary_path=pipeline_summary_path,
                )
                _append_pipeline_log(
                    pipeline_log_path,
                    step="BENCHMARK",
                    status="SKIPPED",
                    detail="benchmark depends on Ollama registration in phase 1",
                    steps=pipeline_steps,
                    summary_path=pipeline_summary_path,
                )

            run.current_step = "report"
            session.add(run)
            session.commit()
            _append_worker_log(log_path, "Report generation started.")
            _append_pipeline_log(
                pipeline_log_path,
                step="REPORT",
                status="STARTED",
                detail="building run report",
                steps=pipeline_steps,
                summary_path=pipeline_summary_path,
            )

            run.status = "completed"
            run.current_step = "completed"
            run.finished_at = utcnow()
            experiment.status = "completed"
            experiment.updated_at = utcnow()

            report_path = settings.reports_root / "single" / f"{run.id}.json"
            build_run_report(
                report_path=report_path,
                experiment=experiment,
                run=run,
                trainer_backend=prepared.trainer_backend,
                route_type=prepared.route_type,
                command_preview=preview_payload,
                ollama=ollama_summary,
                evaluation=eval_summary,
                benchmark=benchmark_summary,
                automation_pipeline={
                    "log_path": str(pipeline_log_path),
                    "summary_path": str(pipeline_summary_path),
                    "steps": pipeline_steps,
                },
            )
            _write_artifact(session, run.id, "run_report", report_path)
            _write_metric(
                session,
                run.id,
                "train",
                "prepared_files_count",
                float(len(prepared.extra_files)),
                {"trainer_backend": prepared.trainer_backend},
            )

            session.add(run)
            session.add(experiment)
            session.commit()
            _append_worker_log(log_path, "Run completed successfully.")
            _append_pipeline_log(
                pipeline_log_path,
                step="REPORT",
                status="COMPLETED",
                detail=f"report_path={report_path}",
                steps=pipeline_steps,
                summary_path=pipeline_summary_path,
            )
            _append_pipeline_log(
                pipeline_log_path,
                step="RUN",
                status="COMPLETED",
                detail=f"run_id={run.id} status=completed",
                steps=pipeline_steps,
                summary_path=pipeline_summary_path,
            )
            LOGGER.info("Processed run %s", run.id)
    except Exception as exc:  # pragma: no cover
        LOGGER.exception("Run processing failed: %s", run_id)
        failed_log_path = settings.runs_root / run_id / "logs" / "worker.log"
        failed_pipeline_log_path = settings.runs_root / run_id / "logs" / "automation_pipeline.log"
        _append_worker_log(failed_log_path, f"Run failed. error={exc}")
        _append_pipeline_log(
            failed_pipeline_log_path,
            step="RUN",
            status="FAILED",
            detail=f"error={exc}",
        )
        with Session(engine) as session:
            run = session.get(Run, run_id)
            if run is not None:
                run.status = "failed"
                run.current_step = "failed"
                run.error_message = str(exc)
                run.finished_at = utcnow()
                session.add(run)
            experiment = session.get(Experiment, run.experiment_id) if run else None
            if experiment is not None:
                experiment.status = "failed"
                experiment.updated_at = utcnow()
                session.add(experiment)
            session.commit()


def poll_once() -> bool:
    with Session(engine) as session:
        pending_runs = list_pending_runs(session)
        if not pending_runs:
            return False
        next_run = pending_runs[0]
    process_run(next_run.id)
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="SQLite-backed worker for pending training runs.")
    parser.add_argument("--once", action="store_true", help="Process at most one pending run and exit.")
    parser.add_argument("--interval", type=int, default=5, help="Polling interval in seconds.")
    args = parser.parse_args()

    configure_logging()
    init_db()

    if args.once:
        poll_once()
        return

    while True:
        processed = poll_once()
        if not processed:
            time.sleep(args.interval)


if __name__ == "__main__":
    main()
