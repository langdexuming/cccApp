from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx


@dataclass(slots=True)
class OllamaClient:
    base_url: str
    timeout_seconds: int = 300

    def health(self) -> dict:
        with httpx.Client(base_url=self.base_url, timeout=self.timeout_seconds) as client:
            response = client.get("/api/tags")
            response.raise_for_status()
            return response.json()

    def chat(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        fmt: str | dict[str, Any] | None = None,
        options: dict[str, Any] | None = None,
        keep_alive: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": False,
        }
        if fmt is not None:
            payload["format"] = fmt
        if options:
            payload["options"] = options
        if keep_alive:
            payload["keep_alive"] = keep_alive
        with httpx.Client(base_url=self.base_url, timeout=self.timeout_seconds) as client:
            response = client.post("/api/chat", json=payload)
            response.raise_for_status()
            return response.json()


def sanitize_model_name(raw: str) -> str:
    allowed = []
    for char in raw.lower():
        if char.isalnum() or char in {"-", "_", "."}:
            allowed.append(char)
        else:
            allowed.append("-")
    name = "".join(allowed).strip("-")
    while "--" in name:
        name = name.replace("--", "-")
    return name or "model"


def build_modelfile(
    *,
    from_ref: str,
    system_prompt: str | None = None,
    parameters: dict[str, Any] | None = None,
) -> str:
    lines = [f"FROM {from_ref}"]
    if system_prompt:
        lines.append(f'SYSTEM """{system_prompt}"""')
    for key, value in (parameters or {}).items():
        lines.append(f"PARAMETER {key} {value}")
    return "\n".join(lines) + "\n"


def write_modelfile(
    *,
    output_path: Path,
    from_ref: str,
    system_prompt: str | None = None,
    parameters: dict[str, Any] | None = None,
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        build_modelfile(from_ref=from_ref, system_prompt=system_prompt, parameters=parameters),
        encoding="utf-8",
    )
    return output_path
