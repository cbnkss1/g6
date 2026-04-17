"""스포츠 경기 시작 시각 기준 베팅 가능 여부 (UTC)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def match_kickoff_has_passed(match_at: datetime, *, now: Optional[datetime] = None) -> bool:
    """경기 시작 시각이 현재(또는 now)보다 이전이거나 같으면 True — 베팅 불가."""
    if match_at is None:
        return True
    t = now or utc_now()
    if match_at.tzinfo is None:
        match_at = match_at.replace(tzinfo=timezone.utc)
    return match_at <= t
