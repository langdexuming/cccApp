from __future__ import annotations

import json
from pathlib import Path
from statistics import mean
from typing import Any

from app.adapters.inference.ollama import OllamaClient


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            raw = line.strip()
            if not raw:
                continue
            items.append(json.loads(raw))
    return items


def normalize_messages(case: dict[str, Any]) -> list[dict[str, str]]:
    if "messages" in case and isinstance(case["messages"], list):
        return case["messages"]

    messages: list[dict[str, str]] = []
    system_prompt = case.get("system")
    user_prompt = case.get("user") or case.get("prompt")
    if system_prompt:
        messages.append({"role": "system", "content": str(system_prompt)})
    if user_prompt:
        messages.append({"role": "user", "content": str(user_prompt)})
    if not messages:
        raise ValueError("Case must contain either messages or user/prompt.")
    return messages


def _safe_json_loads(text: str) -> tuple[bool, Any]:
    try:
        return True, json.loads(text)
    except Exception:
        return False, None


def _extract_answer_text(response: dict[str, Any]) -> str:
    message = response.get("message", {}) or {}
    content = str(message.get("content", "") or "").strip()
    if content:
        return content
    # Qwen-family models on Ollama may occasionally return the usable text in
    # `thinking` while leaving `content` empty even with `/no_think`.
    thinking = str(message.get("thinking", "") or "").strip()
    if thinking:
        return thinking
    return ""


def _score_case(case: dict[str, Any], answer_text: str) -> dict[str, Any]:
    result: dict[str, Any] = {
        "json_valid": None,
        "exact_match": None,
        "field_accuracy": None,
    }

    expected_json = case.get("expected_json")
    expected_text = case.get("expected_text")
    expected_contains = case.get("expected_contains")

    if expected_json is not None:
        ok, parsed = _safe_json_loads(answer_text)
        result["json_valid"] = ok
        if ok and isinstance(expected_json, dict) and isinstance(parsed, dict):
            keys = list(expected_json.keys())
            matched = sum(1 for key in keys if parsed.get(key) == expected_json.get(key))
            result["field_accuracy"] = matched / len(keys) if keys else 1.0
        else:
            result["field_accuracy"] = 0.0
    elif case.get("require_json"):
        ok, _ = _safe_json_loads(answer_text)
        result["json_valid"] = ok

    if expected_text is not None:
        result["exact_match"] = float(answer_text.strip() == str(expected_text).strip())

    if expected_contains:
        contains_hits = sum(1 for item in expected_contains if str(item) in answer_text)
        result["contains_accuracy"] = contains_hits / len(expected_contains)

    return result


def run_eval_suite(
    *,
    client: OllamaClient,
    model_name: str,
    dataset_path: Path,
    output_path: Path,
    options: dict[str, Any] | None = None,
    fmt: str | dict[str, Any] | None = None,
    keep_alive: str | None = None,
) -> dict[str, Any]:
    cases = load_jsonl(dataset_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    results: list[dict[str, Any]] = []
    json_valid_scores: list[float] = []
    exact_match_scores: list[float] = []
    field_accuracy_scores: list[float] = []
    contains_scores: list[float] = []

    with output_path.open("w", encoding="utf-8") as handle:
        for case in cases:
            response = client.chat(
                model=model_name,
                messages=normalize_messages(case),
                fmt=fmt,
                options=options,
                keep_alive=keep_alive,
            )
            answer_text = _extract_answer_text(response)
            score = _score_case(case, answer_text)
            if score.get("json_valid") is not None:
                json_valid_scores.append(float(score["json_valid"]))
            if score.get("exact_match") is not None:
                exact_match_scores.append(float(score["exact_match"]))
            if score.get("field_accuracy") is not None:
                field_accuracy_scores.append(float(score["field_accuracy"]))
            if score.get("contains_accuracy") is not None:
                contains_scores.append(float(score["contains_accuracy"]))

            record = {
                "case_id": case.get("id"),
                "task_type": case.get("task_type"),
                "response": response,
                "answer_text": answer_text,
                "score": score,
            }
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
            results.append(record)

    summary = {
        "case_count": len(results),
        "json_valid_rate": mean(json_valid_scores) if json_valid_scores else None,
        "exact_match_rate": mean(exact_match_scores) if exact_match_scores else None,
        "field_accuracy": mean(field_accuracy_scores) if field_accuracy_scores else None,
        "contains_accuracy": mean(contains_scores) if contains_scores else None,
    }
    return summary


def run_benchmark_suite(
    *,
    client: OllamaClient,
    model_name: str,
    dataset_path: Path,
    output_path: Path,
    options: dict[str, Any] | None = None,
    fmt: str | dict[str, Any] | None = None,
    keep_alive: str | None = None,
) -> dict[str, Any]:
    cases = load_jsonl(dataset_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    totals_ms: list[float] = []
    eval_tokens_per_sec: list[float] = []
    prompt_tokens: list[int] = []
    gen_tokens: list[int] = []

    with output_path.open("w", encoding="utf-8") as handle:
        for case in cases:
            response = client.chat(
                model=model_name,
                messages=normalize_messages(case),
                fmt=fmt,
                options=options,
                keep_alive=keep_alive,
            )

            total_duration = float(response.get("total_duration", 0)) / 1_000_000
            eval_count = int(response.get("eval_count", 0) or 0)
            eval_duration_ns = float(response.get("eval_duration", 0) or 0)
            prompt_eval_count = int(response.get("prompt_eval_count", 0) or 0)
            tps = None
            if eval_count > 0 and eval_duration_ns > 0:
                tps = eval_count / (eval_duration_ns / 1_000_000_000)

            totals_ms.append(total_duration)
            prompt_tokens.append(prompt_eval_count)
            gen_tokens.append(eval_count)
            if tps is not None:
                eval_tokens_per_sec.append(tps)

            handle.write(json.dumps({"case_id": case.get("id"), "response": response}, ensure_ascii=False) + "\n")

    return {
        "case_count": len(cases),
        "avg_total_ms": mean(totals_ms) if totals_ms else None,
        "avg_prompt_tokens": mean(prompt_tokens) if prompt_tokens else None,
        "avg_gen_tokens": mean(gen_tokens) if gen_tokens else None,
        "avg_eval_tokens_per_sec": mean(eval_tokens_per_sec) if eval_tokens_per_sec else None,
    }
