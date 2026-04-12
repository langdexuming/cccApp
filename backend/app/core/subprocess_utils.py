from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Mapping


class CommandExecutionError(RuntimeError):
    pass


def run_and_log(
    *,
    command: list[str],
    cwd: Path,
    log_path: Path,
    env: Mapping[str, str] | None = None,
) -> int:
    cwd.mkdir(parents=True, exist_ok=True)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)

    with log_path.open("a", encoding="utf-8") as log_handle:
        log_handle.write(f"$ {' '.join(command)}\n")
        log_handle.flush()
        process = subprocess.Popen(
            command,
            cwd=str(cwd),
            env=merged_env,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            text=True,
        )
        return_code = process.wait()
        log_handle.write(f"\n[exit_code] {return_code}\n")
        log_handle.flush()

    if return_code != 0:
        raise CommandExecutionError(
            f"Command failed with exit code {return_code}: {' '.join(command)}"
        )
    return return_code
