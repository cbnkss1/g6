"""메모리 기반 1X2 배당 틱 시뮬레이터 (asyncio 백그라운드 태스크)."""

from __future__ import annotations

import asyncio
import random
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.services.mock_sports_odds_data import build_initial_matches

_lock = Lock()
_matches: List[Dict[str, Any]] = []
_tick_count: int = 0
_loop_task: Optional[asyncio.Task] = None

_ODD_MIN = 1.01
_ODD_MAX = 50.0
_DELTA = 0.05


def _clamp_odd(x: float) -> float:
    return max(_ODD_MIN, min(_ODD_MAX, round(float(x), 2)))


def reset_matches_from_seed() -> None:
    global _matches, _tick_count
    with _lock:
        _matches = [dict(m) for m in build_initial_matches()]
        _tick_count = 0


def _tick_unlocked() -> None:
    global _tick_count
    for m in _matches:
        m["odds_home"] = _clamp_odd(m["odds_home"] + random.uniform(-_DELTA, _DELTA))
        m["odds_draw"] = _clamp_odd(m["odds_draw"] + random.uniform(-_DELTA, _DELTA))
        m["odds_away"] = _clamp_odd(m["odds_away"] + random.uniform(-_DELTA, _DELTA))
    _tick_count += 1


def tick_once_for_tests() -> None:
    """단위 테스트용(락 동일 경로)."""
    with _lock:
        _tick_unlocked()


def get_public_snapshot() -> Dict[str, Any]:
    """GET /api/mock-odds 응답 본문."""
    with _lock:
        matches_copy = [dict(x) for x in _matches]
        tick = _tick_count
    return {
        "mock": True,
        "tick": tick,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "matches": matches_copy,
    }


async def _run_tick_loop() -> None:
    interval = float(settings.MOCK_SPORTS_ODDS_TICK_SEC)
    while True:
        try:
            await asyncio.sleep(interval)
            with _lock:
                if not _matches:
                    reset_matches_from_seed()
                _tick_unlocked()
        except asyncio.CancelledError:
            break


async def start_mock_odds_background() -> Optional[asyncio.Task]:
    """lifespan startup: 설정이 켜져 있을 때만 태스크 시작."""
    global _loop_task
    if not settings.USE_MOCK_SPORTS_ODDS:
        return None
    reset_matches_from_seed()
    _loop_task = asyncio.create_task(_run_tick_loop(), name="mock_sports_odds_tick")
    return _loop_task


async def stop_mock_odds_background() -> None:
    """lifespan shutdown."""
    global _loop_task
    t = _loop_task
    _loop_task = None
    if t is None:
        return
    t.cancel()
    try:
        await t
    except asyncio.CancelledError:
        pass
