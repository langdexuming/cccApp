from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.adapters.inference.ollama import OllamaClient  # noqa: E402
from app.services.ollama_eval import run_benchmark_suite, run_eval_suite  # noqa: E402


def _parse_json_arg(raw: str | None, *, default: Any) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    try:
        return ast.literal_eval(raw)
    except Exception:
        pass

    repaired = re.sub(r'([{,]\s*)([A-Za-z_][\w-]*)(\s*:)', r'\1"\2"\3', raw)
    return json.loads(repaired)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run offline evaluation or benchmark on a local Ollama model.")
    parser.add_argument("--mode", choices=["eval", "benchmark"], default="eval")
    parser.add_argument("--model-name", required=True)
    parser.add_argument("--dataset-path", required=True)
    parser.add_argument("--output-path", required=True)
    parser.add_argument("--summary-path", required=True)
    parser.add_argument("--base-url", default="http://127.0.0.1:11434")
    parser.add_argument("--timeout-seconds", type=int, default=300)
    parser.add_argument("--keep-alive", default="10m")
    parser.add_argument("--options-json", default="")
    parser.add_argument("--format-json", default="")
    args = parser.parse_args()

    options = _parse_json_arg(args.options_json, default={})
    fmt = _parse_json_arg(args.format_json, default=None)

    client = OllamaClient(
        base_url=args.base_url,
        timeout_seconds=args.timeout_seconds,
    )

    dataset_path = Path(args.dataset_path)
    output_path = Path(args.output_path)
    summary_path = Path(args.summary_path)

    if args.mode == "eval":
        summary = run_eval_suite(
            client=client,
            model_name=args.model_name,
            dataset_path=dataset_path,
            output_path=output_path,
            options=options,
            fmt=fmt,
            keep_alive=args.keep_alive,
        )
    else:
        summary = run_benchmark_suite(
            client=client,
            model_name=args.model_name,
            dataset_path=dataset_path,
            output_path=output_path,
            options=options,
            fmt=fmt,
            keep_alive=args.keep_alive,
        )

    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
