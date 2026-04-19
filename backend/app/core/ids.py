from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def make_id(prefix: str) -> str:
    stamp = utcnow().strftime("%Y%m%d_%H%M%S")
    suffix = uuid4().hex[:6]
    return f"{prefix}_{stamp}_{suffix}"
