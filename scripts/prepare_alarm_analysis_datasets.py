from __future__ import annotations

import argparse
import json
import random
import re
import statistics
from collections import Counter
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = REPO_ROOT / "resources" / "alarm_analysis.json"
DEFAULT_DATASETS_ROOT = REPO_ROOT / "runtime" / "datasets"
DEFAULT_TRAIN_VERSION = "alarm_analysis_train_v1"
DEFAULT_SWIFT_TRAIN_VERSION = "alarm_analysis_swift_sft_v1"
DEFAULT_EVAL_VERSION = "alarm_analysis_eval_v1"

TRAIN_INSTRUCTION = (
    "你是机房设备运维专家，请基于压缩整理后的动环监控平台关联告警摘要，"
    "分析根本原因、影响范围和处置建议。"
)
EVAL_SYSTEM_PROMPT = (
    "/no_think\n"
    "你是机房设备运维专家，请基于压缩整理后的动环监控平台关联告警摘要，"
    "分析根本原因、影响范围和处置建议。"
    "直接输出诊断结论，不要输出与诊断无关的前言。"
)

TIMESTAMP_SPLIT = re.compile(r"(?=\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\s)")
MULTISPACE = re.compile(r"\s+")
BLANK_LINES = re.compile(r"\n{3,}")
ROOT_CAUSE_MARKERS = (
    "根本原因：",
    "根本原因:",
    "主要原因：",
    "主要原因:",
    "核心原因：",
    "核心原因:",
    "综合结论：",
    "综合结论:",
    "最终结论：",
    "最终结论:",
    "综合判断：",
    "综合判断:",
)
ROOT_CAUSE_HINTS = (
    "根本原因",
    "主要原因",
    "核心原因",
    "综合结论",
    "最终结论",
    "综合判断",
)
SCORING_HINTS = (
    *ROOT_CAUSE_HINTS,
    "结论",
    "推论",
    "判断",
)
CAUSE_KEYWORDS = (
    "导致",
    "引发",
    "造成",
    "由于",
    "因",
    "引起",
    "触发",
)
GENERIC_TITLES = (
    "分析报告",
    "处理方案",
    "告警概览",
    "信息汇总",
    "信息梳理",
    "事件概述",
    "解决方案",
    "预防措施",
    "关键告警关联分析",
    "关键数据异常",
    "告警摘要",
    "时间线梳理",
    "告警概况",
)
DOMAIN_KEYWORDS = (
    "市电",
    "供电",
    "配电",
    "UPS",
    "电池",
    "空调",
    "冷水空调",
    "专用空调",
    "门磁",
    "门禁",
    "温度",
    "湿度",
    "温湿度",
    "漏水",
    "烟感",
    "通信",
    "断电",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare train/eval datasets from alarm_analysis.json")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--datasets-root", type=Path, default=DEFAULT_DATASETS_ROOT)
    parser.add_argument("--train-version", default=DEFAULT_TRAIN_VERSION)
    parser.add_argument("--swift-train-version", default=DEFAULT_SWIFT_TRAIN_VERSION)
    parser.add_argument("--eval-version", default=DEFAULT_EVAL_VERSION)
    parser.add_argument("--eval-count", type=int, default=64)
    parser.add_argument("--benchmark-count", type=int, default=16)
    parser.add_argument("--smoke-count", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def load_source(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise ValueError(f"Source dataset must be a JSON list: {path}")
    return data


def normalize_output(text: str) -> str:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    normalized = "\n".join(line.rstrip() for line in normalized.split("\n"))
    return BLANK_LINES.sub("\n\n", normalized)


def normalize_inline(text: str) -> str:
    return MULTISPACE.sub(" ", text.replace("\r", " ").replace("\n", " ")).strip()


def split_alarm_events(raw_input: str) -> list[dict[str, str]]:
    normalized = normalize_inline(raw_input)
    if not normalized:
        return []

    chunks = [part.strip() for part in TIMESTAMP_SPLIT.split(normalized) if part.strip()]
    events: list[dict[str, str]] = []
    for index, chunk in enumerate(chunks):
        timestamp = chunk[:19] if len(chunk) >= 19 else f"unknown-{index:03d}"
        remainder = chunk[19:].strip() if len(chunk) > 19 else chunk
        if " " in remainder:
            device, alarm_text = remainder.split(" ", 1)
        else:
            device, alarm_text = remainder, "未提供告警详情"
        device = device.strip() or "未知设备"
        alarm_text = alarm_text.strip() or "未提供告警详情"
        events.append(
            {
                "timestamp": timestamp,
                "device": device,
                "alarm_text": alarm_text,
                "signature": f"{device}|{alarm_text}",
            }
        )
    return events


def shorten(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def render_event_rollup(item: dict[str, Any], with_count: bool = True) -> str:
    base = f"{item['first_ts']} {item['device']} {item['alarm_text']}"
    if with_count and item["count"] > 1:
        base += f"（重复{item['count']}次，最后一次 {item['last_ts']}）"
    return shorten(base, 120)


def compress_alarm_input(raw_input: str) -> tuple[str, dict[str, Any]]:
    events = split_alarm_events(raw_input)
    if not events:
        fallback = shorten(normalize_inline(raw_input), 2000)
        return fallback, {
            "raw_event_count": 0,
            "unique_event_count": 0,
            "device_count": 0,
            "top_devices": [],
            "time_window": None,
        }

    device_counter: Counter[str] = Counter()
    rollup: dict[str, dict[str, Any]] = {}
    first_seen_keys: list[str] = []

    for event in events:
        device_counter[event["device"]] += 1
        key = event["signature"]
        if key not in rollup:
            rollup[key] = {
                "device": event["device"],
                "alarm_text": event["alarm_text"],
                "first_ts": event["timestamp"],
                "last_ts": event["timestamp"],
                "count": 0,
            }
            first_seen_keys.append(key)
        rollup[key]["count"] += 1
        rollup[key]["last_ts"] = event["timestamp"]

    earliest_items = [rollup[key] for key in first_seen_keys[:6]]
    repeated_items = sorted(
        rollup.values(),
        key=lambda item: (-item["count"], item["first_ts"], item["device"], item["alarm_text"]),
    )
    repeated_items = repeated_items[:10]
    tail_items = [rollup[key] for key in first_seen_keys[-4:]]

    selected_keys = {
        f"{item['device']}|{item['alarm_text']}"
        for item in earliest_items
    }
    dedup_repeated = []
    for item in repeated_items:
        key = f"{item['device']}|{item['alarm_text']}"
        if key in selected_keys:
            continue
        selected_keys.add(key)
        dedup_repeated.append(item)

    dedup_tail = []
    for item in tail_items:
        key = f"{item['device']}|{item['alarm_text']}"
        if key in selected_keys:
            continue
        selected_keys.add(key)
        dedup_tail.append(item)

    top_devices = [device for device, _ in device_counter.most_common(8)]
    device_summary = "；".join(f"{device} x{count}" for device, count in device_counter.most_common(8))

    sections = [
        "告警摘要（已压缩整理）",
        f"告警窗口：{events[0]['timestamp']} 至 {events[-1]['timestamp']}",
        f"原始告警数：{len(events)}",
        f"去重后事件数：{len(rollup)}",
        f"涉及设备数：{len(device_counter)}",
        f"高频设备：{shorten(device_summary, 220)}",
        "",
        "首发关键事件：",
    ]
    sections.extend(f"{index}. {render_event_rollup(item, with_count=False)}" for index, item in enumerate(earliest_items, start=1))

    if dedup_repeated:
        sections.extend(["", "高频重复事件："])
        sections.extend(
            f"{index}. {render_event_rollup(item, with_count=True)}"
            for index, item in enumerate(dedup_repeated, start=1)
        )

    if dedup_tail:
        sections.extend(["", "尾部收敛事件："])
        sections.extend(
            f"{index}. {render_event_rollup(item, with_count=False)}"
            for index, item in enumerate(dedup_tail, start=1)
        )

    compact_input = "\n".join(sections).strip()
    compact_input = shorten(compact_input, 2600)

    meta = {
        "raw_event_count": len(events),
        "unique_event_count": len(rollup),
        "device_count": len(device_counter),
        "top_devices": top_devices,
        "time_window": {
            "start": events[0]["timestamp"],
            "end": events[-1]["timestamp"],
        },
    }
    return compact_input, meta


def cleanup_candidate(text: str) -> str:
    cleaned = (
        text.replace("*", " ")
        .replace("#", " ")
        .replace("`", " ")
        .replace(">", " ")
        .replace("|", " ")
    )
    cleaned = normalize_inline(cleaned)
    return cleaned.strip(" ：:-")


def is_generic_title(text: str) -> bool:
    if not text:
        return True
    lowered = text.lower()
    if "root cause" in lowered and len(text) <= 24:
        return True
    if any(token in text for token in GENERIC_TITLES):
        return True
    if len(text) < 8:
        return True
    if text.endswith(("概览", "梳理", "摘要", "方案", "报告")) and not any(
        keyword in text for keyword in CAUSE_KEYWORDS
    ):
        return True
    return False


def extract_after_hint(line: str) -> str:
    for hint in ROOT_CAUSE_HINTS:
        if hint not in line:
            continue
        tail = cleanup_candidate(line.split(hint, 1)[1])
        tail = tail.lstrip("：:")
        for sep in ("。", "；", "！", "？"):
            tail = tail.split(sep, 1)[0]
        tail = cleanup_candidate(tail)
        if tail and not is_generic_title(tail):
            return tail
    return ""


def sentence_score(text: str) -> int:
    score = 0
    if any(hint in text for hint in SCORING_HINTS):
        score += 6
    if any(keyword in text for keyword in CAUSE_KEYWORDS):
        score += 4
    if any(keyword in text for keyword in DOMAIN_KEYWORDS):
        score += 2
    if any(token in text for token in GENERIC_TITLES):
        score -= 6
    if "排除" in text and not any(hint in text for hint in ROOT_CAUSE_HINTS):
        score -= 5
    if text.startswith(("本次告警事件包含", "告警时间", "告警设备", "主要告警类型")):
        score -= 4
    return score


def finalize_root_cause(text: str) -> str:
    cleaned = cleanup_candidate(text)
    for prefix in ("根本原因是", "主要原因是", "核心原因是", "本次故障的根本原因是"):
        if cleaned.startswith(prefix):
            cleaned = cleanup_candidate(cleaned[len(prefix) :])
    if cleaned.startswith("虽然") and "即" in cleaned:
        cleaned = cleanup_candidate(cleaned.split("即", 1)[1])
    cleaned = cleaned.lstrip("是为即 ")
    return cleanup_candidate(cleaned)


def extract_root_cause(output: str) -> str:
    lines = [cleanup_candidate(line) for line in output.splitlines() if cleanup_candidate(line)]

    for line in lines:
        candidate = extract_after_hint(line)
        if candidate:
            return finalize_root_cause(candidate)
        for marker in ROOT_CAUSE_MARKERS:
            if marker not in line:
                continue
            candidate = cleanup_candidate(line.split(marker, 1)[1])
            for sep in ("。", "；", "！", "？"):
                candidate = candidate.split(sep, 1)[0]
            candidate = cleanup_candidate(candidate)
            if candidate and not is_generic_title(candidate):
                return finalize_root_cause(candidate)

    plain = cleanup_candidate(output)
    for marker in ROOT_CAUSE_MARKERS:
        index = plain.find(marker)
        if index < 0:
            continue
        candidate = cleanup_candidate(plain[index + len(marker) :])
        for sep in ("。", "；", "！", "？"):
            candidate = candidate.split(sep, 1)[0]
        candidate = cleanup_candidate(candidate)
        if candidate and not is_generic_title(candidate):
            return finalize_root_cause(candidate)

    sentence_candidates: list[tuple[int, str]] = []
    for line in lines:
        parts = [cleanup_candidate(part) for part in re.split(r"[。！？；]", line)]
        for part in parts:
            if not part or is_generic_title(part):
                continue
            extracted = extract_after_hint(part)
            if extracted:
                return finalize_root_cause(extracted)
            score = sentence_score(part)
            if score > 0:
                sentence_candidates.append((score, part))

    if sentence_candidates:
        sentence_candidates.sort(key=lambda item: (item[0], len(item[1])), reverse=True)
        return finalize_root_cause(sentence_candidates[0][1])

    return ""


def build_expected_contains(output: str, top_devices: list[str]) -> list[str]:
    phrases: list[str] = []

    root_cause = extract_root_cause(output)
    if root_cause:
        phrases.append(root_cause)

    for device in top_devices[:2]:
        if device and device not in phrases:
            phrases.append(device)

    for keyword in DOMAIN_KEYWORDS:
        if keyword in output and keyword not in phrases:
            phrases.append(keyword)
        if len(phrases) >= 4:
            break

    if not phrases:
        phrases.append("根因")
    return phrases[:4]


def calc_stats(values: list[int]) -> dict[str, float | int]:
    return {
        "min": min(values),
        "avg": round(statistics.mean(values), 2),
        "max": max(values),
    }


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def validate_outputs(
    train_dir: Path,
    train_version: str,
    swift_train_dir: Path,
    swift_train_version: str,
    eval_dir: Path,
) -> dict[str, Any]:
    dataset_info_path = train_dir / "dataset_info.json"
    train_json_path = train_dir / f"{train_version}.json"
    swift_train_jsonl_path = swift_train_dir / f"{swift_train_version}.jsonl"
    eval_jsonl_path = eval_dir / "eval.jsonl"
    benchmark_jsonl_path = eval_dir / "benchmark.jsonl"
    smoke_jsonl_path = eval_dir / "smoke_eval.jsonl"

    dataset_info = json.loads(dataset_info_path.read_text(encoding="utf-8"))
    if train_version not in dataset_info:
        raise ValueError(f"dataset_info.json missing dataset key: {train_version}")

    train_records = json.loads(train_json_path.read_text(encoding="utf-8"))
    if not isinstance(train_records, list) or not train_records:
        raise ValueError("Train dataset is empty.")

    def _load_jsonl(path: Path) -> list[dict[str, Any]]:
        items = []
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                raw = line.strip()
                if not raw:
                    continue
                items.append(json.loads(raw))
        return items

    eval_records = _load_jsonl(eval_jsonl_path)
    benchmark_records = _load_jsonl(benchmark_jsonl_path)
    smoke_records = _load_jsonl(smoke_jsonl_path)
    swift_train_records = _load_jsonl(swift_train_jsonl_path)

    if not eval_records:
        raise ValueError("Eval dataset is empty.")
    if not benchmark_records:
        raise ValueError("Benchmark dataset is empty.")
    if not smoke_records:
        raise ValueError("Smoke eval dataset is empty.")
    if not swift_train_records:
        raise ValueError("Swift train dataset is empty.")

    first_train = train_records[0]
    for key in ("instruction", "input", "output"):
        if not first_train.get(key):
            raise ValueError(f"Train sample missing field: {key}")

    first_swift_train = swift_train_records[0]
    if "messages" not in first_swift_train or not isinstance(first_swift_train["messages"], list):
        raise ValueError("Swift train sample missing messages field.")

    first_eval = eval_records[0]
    if "messages" not in first_eval or "expected_contains" not in first_eval:
        raise ValueError("Eval sample missing required fields.")

    return {
        "train_records": len(train_records),
        "swift_train_records": len(swift_train_records),
        "eval_records": len(eval_records),
        "benchmark_records": len(benchmark_records),
        "smoke_records": len(smoke_records),
    }


def main() -> None:
    args = parse_args()
    source_records = load_source(args.source)
    if args.eval_count >= len(source_records):
        raise ValueError("eval_count must be smaller than total sample count.")

    prepared_records: list[dict[str, Any]] = []
    raw_input_lengths: list[int] = []
    compact_input_lengths: list[int] = []
    output_lengths: list[int] = []
    source_counter: Counter[str] = Counter()

    for index, record in enumerate(source_records, start=1):
        raw_input = str(record.get("input", ""))
        normalized_output = normalize_output(str(record.get("output", "")))
        compact_input, compact_meta = compress_alarm_input(raw_input)

        prepared = {
            "id": f"alarm-analysis-{index:04d}",
            "instruction": TRAIN_INSTRUCTION,
            "input": compact_input,
            "output": normalized_output,
            "source": str(record.get("source", "")),
            "raw_instruction": str(record.get("instruction", "")),
            "raw_input_chars": len(raw_input),
            "compact_input_chars": len(compact_input),
            "output_chars": len(normalized_output),
            "raw_event_count": compact_meta["raw_event_count"],
            "unique_event_count": compact_meta["unique_event_count"],
            "device_count": compact_meta["device_count"],
            "top_devices": compact_meta["top_devices"],
            "time_window": compact_meta["time_window"],
            "expected_contains": build_expected_contains(normalized_output, compact_meta["top_devices"]),
            "root_cause": extract_root_cause(normalized_output),
        }
        prepared_records.append(prepared)
        raw_input_lengths.append(len(raw_input))
        compact_input_lengths.append(len(compact_input))
        output_lengths.append(len(normalized_output))
        source_counter[prepared["source"]] += 1

    rng = random.Random(args.seed)
    shuffled_records = list(prepared_records)
    rng.shuffle(shuffled_records)
    eval_records = shuffled_records[: args.eval_count]
    train_records = shuffled_records[args.eval_count :]

    benchmark_records = sorted(eval_records, key=lambda item: item["compact_input_chars"])[: args.benchmark_count]
    smoke_records = benchmark_records[: args.smoke_count]

    train_dir = args.datasets_root / args.train_version
    swift_train_dir = args.datasets_root / args.swift_train_version
    eval_dir = args.datasets_root / args.eval_version
    ensure_dir(train_dir)
    ensure_dir(swift_train_dir)
    ensure_dir(eval_dir)

    train_payload = [
        {
            "id": record["id"],
            "instruction": record["instruction"],
            "input": record["input"],
            "output": record["output"],
            "source": record["source"],
            "raw_input_chars": record["raw_input_chars"],
            "compact_input_chars": record["compact_input_chars"],
            "raw_event_count": record["raw_event_count"],
            "unique_event_count": record["unique_event_count"],
            "device_count": record["device_count"],
        }
        for record in train_records
    ]

    dataset_info = {
        args.train_version: {
            "file_name": f"{args.train_version}.json",
            "formatting": "alpaca",
            "columns": {
                "prompt": "instruction",
                "query": "input",
                "response": "output",
            },
        }
    }

    swift_train_payload = [
        {
            "id": record["id"],
            "messages": [
                {"role": "system", "content": TRAIN_INSTRUCTION},
                {"role": "user", "content": record["input"]},
                {"role": "assistant", "content": record["output"]},
            ],
            "meta": {
                "source": record["source"],
                "raw_event_count": record["raw_event_count"],
                "unique_event_count": record["unique_event_count"],
                "device_count": record["device_count"],
                "top_devices": record["top_devices"],
            },
        }
        for record in train_records
    ]

    eval_payload = [
        {
            "id": record["id"],
            "task_type": "alarm_diagnosis",
            "messages": [
                {"role": "system", "content": EVAL_SYSTEM_PROMPT},
                {"role": "user", "content": record["input"]},
            ],
            "expected_contains": record["expected_contains"],
            "meta": {
                "root_cause": record["root_cause"],
                "top_devices": record["top_devices"],
                "raw_event_count": record["raw_event_count"],
                "unique_event_count": record["unique_event_count"],
                "source": record["source"],
            },
        }
        for record in eval_records
    ]

    benchmark_payload = [
        {
            "id": record["id"],
            "task_type": "alarm_diagnosis_benchmark",
            "messages": [
                {"role": "system", "content": EVAL_SYSTEM_PROMPT},
                {"role": "user", "content": record["input"]},
            ],
            "meta": {
                "raw_event_count": record["raw_event_count"],
                "unique_event_count": record["unique_event_count"],
            },
        }
        for record in benchmark_records
    ]

    smoke_payload = [
        {
            "id": record["id"],
            "task_type": "alarm_diagnosis_smoke",
            "messages": [
                {"role": "system", "content": EVAL_SYSTEM_PROMPT},
                {"role": "user", "content": record["input"]},
            ],
            "expected_contains": record["expected_contains"],
            "meta": {
                "root_cause": record["root_cause"],
                "top_devices": record["top_devices"],
                "raw_event_count": record["raw_event_count"],
                "unique_event_count": record["unique_event_count"],
                "source": record["source"],
            },
        }
        for record in smoke_records
    ]

    golden_payload = [
        {
            "id": record["id"],
            "instruction": record["instruction"],
            "input": record["input"],
            "reference_output": record["output"],
            "expected_contains": record["expected_contains"],
            "root_cause": record["root_cause"],
            "meta": {
                "top_devices": record["top_devices"],
                "raw_event_count": record["raw_event_count"],
                "unique_event_count": record["unique_event_count"],
                "source": record["source"],
            },
        }
        for record in eval_records
    ]

    manifest = {
        "source_file": str(args.source),
        "train_version": args.train_version,
        "swift_train_version": args.swift_train_version,
        "eval_version": args.eval_version,
        "seed": args.seed,
        "total_samples": len(prepared_records),
        "train_samples": len(train_payload),
        "swift_train_samples": len(swift_train_payload),
        "eval_samples": len(eval_payload),
        "benchmark_samples": len(benchmark_payload),
        "smoke_samples": len(smoke_payload),
        "source_distribution": dict(source_counter),
        "input_chars": {
            "raw": calc_stats(raw_input_lengths),
            "compact": calc_stats(compact_input_lengths),
        },
        "output_chars": calc_stats(output_lengths),
    }

    write_json(train_dir / "dataset_info.json", dataset_info)
    write_json(train_dir / f"{args.train_version}.json", train_payload)
    write_json(train_dir / "manifest.json", manifest)
    write_jsonl(swift_train_dir / f"{args.swift_train_version}.jsonl", swift_train_payload)
    write_json(swift_train_dir / "manifest.json", manifest)

    write_jsonl(eval_dir / "eval.jsonl", eval_payload)
    write_jsonl(eval_dir / "benchmark.jsonl", benchmark_payload)
    write_jsonl(eval_dir / "smoke_eval.jsonl", smoke_payload)
    write_jsonl(eval_dir / "golden.jsonl", golden_payload)
    write_json(eval_dir / "manifest.json", manifest)

    validation = validate_outputs(
        train_dir,
        args.train_version,
        swift_train_dir,
        args.swift_train_version,
        eval_dir,
    )
    write_json(eval_dir / "validation.json", validation)

    print(json.dumps({"manifest": manifest, "validation": validation}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
