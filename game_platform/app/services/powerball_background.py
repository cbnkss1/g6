"""
파워볼 선택적 백그라운드 poll.

- 한 틱에서 실패해도 프로세스는 종료하지 않고, 지수 대기 후 같은 틱 안에서 재시도.
- cron `POST /internal/powerball/poll` 또는 어드민 버튼은 기존과 동일.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

from app.core.config import settings
from app.core.database import SessionLocal
from app.services.powerball_service import commit_poll_transaction_if_modified, poll_once

logger = logging.getLogger(__name__)

_task: Optional[asyncio.Task[None]] = None


def _sync_poll_commit() -> bool:
    """
    True: 상위 피드 수집 성공(ok) 또는 ORM 변경이 실제로 커밋됨(보정·회차 반영 등).
    False: 피드 실패이고 DB 변경도 없음 → 재시도 대상.
    예외: DB/코드 오류 → 상위에서 재시도.
    """
    db = SessionLocal()
    try:
        out = poll_once(db)
        committed = commit_poll_transaction_if_modified(db)
        if out.get("ok"):
            logger.debug(
                "powerball poll ok games=%s repaired=%s gaps=%s committed=%s",
                len(out.get("games") or []),
                out.get("repaired_settlements"),
                len(out.get("pending_without_round") or []),
                committed,
            )
            return True
        if committed:
            logger.info(
                "powerball upstream not ok but DB committed (repaired=%s session_had_pending=%s): %s",
                out.get("repaired_settlements"),
                out.get("session_had_pending_changes"),
                out.get("error", out),
            )
            return True
        logger.warning("powerball poll not ok: %s", out.get("error", out))
        return False
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


async def _loop(interval_sec: int) -> None:
    max_attempts = int(getattr(settings, "POWERBALL_POLL_MAX_ATTEMPTS_PER_TICK", 12) or 12)
    delay_base = float(getattr(settings, "POWERBALL_POLL_RETRY_DELAY_SEC", 1.0) or 1.0)
    logger.info(
        "powerball background poll: interval=%ss max_attempts_per_tick=%s",
        interval_sec,
        max_attempts,
    )
    while True:
        try:
            for attempt in range(max_attempts):
                try:
                    ok = await asyncio.to_thread(_sync_poll_commit)
                    if ok:
                        break
                except asyncio.CancelledError:
                    raise
                except Exception:
                    logger.exception("powerball poll attempt %s/%s", attempt + 1, max_attempts)
                    if attempt + 1 >= max_attempts:
                        logger.error(
                            "powerball poll exhausted %s attempts; will sleep %ss and continue",
                            max_attempts,
                            interval_sec,
                        )
                        break
                if attempt + 1 < max_attempts:
                    wait = min(30.0, delay_base * (2**attempt))
                    await asyncio.sleep(wait)
        except asyncio.CancelledError:
            raise
        await asyncio.sleep(interval_sec)


def start_background_poll_if_configured() -> None:
    """lifespan 시작 시 1회 호출."""
    global _task
    if _task is not None and not _task.done():
        return
    interval = int(getattr(settings, "POWERBALL_POLL_INTERVAL_SEC", 0) or 0)
    if interval <= 0:
        return
    if not settings.POWERBALL_ENABLED:
        logger.info("powerball background poll skipped (POWERBALL_ENABLED=false)")
        return
    _task = asyncio.create_task(_loop(interval))


async def stop_background_poll() -> None:
    global _task
    if _task is None or _task.done():
        _task = None
        return
    _task.cancel()
    try:
        await _task
    except asyncio.CancelledError:
        pass
    _task = None
    logger.info("powerball background poll stopped")
