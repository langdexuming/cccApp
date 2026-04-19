from __future__ import annotations

import json
from typing import Any


def dumps_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, sort_keys=True)


def loads_json(raw: str | None, default: Any) -> Any:
    if not raw:
        return default
    return json.loads(raw)
