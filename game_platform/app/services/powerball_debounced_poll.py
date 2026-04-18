"""플레이어 트래픽으로 외부 파워볼 피드 poll 을 백그라운드에서 돌림.

Bepick iframe 은 외부 실시간이라 먼저 끝나 보여도, 정산은 `POWERBALL_API_URL` 수집으로
`gp_powerball_rounds` 가 생긴 뒤에만 이뤄짐. cron/배경 poll 이 없으면 pending 만 쌓임.
요청 스레드를 막지 않도록 daemon thread + 전역 디바운스.
"""

from __future__ import annotations

import logging
import threading
import time

from app.core.config import settings
from app.core.database import SessionLocal
from app.services.powerball_service import commit_poll_transaction_if_modified, poll_once

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_last_fire_monotonic = 0.0
_DEFAULT_DEBOUNCE_SEC = 10.0


def request_debounced_powerball_poll(reason: str = "") -> None:
    if not settings.POWERBALL_ENABLED:
        return
    global _last_fire_monotonic
    now = time.monotonic()
    debounce = float(getattr(settings, "POWERBALL_PLAYER_POLL_DEBOUNCE_SEC", _DEFAULT_DEBOUNCE_SEC) or 10.0)
    debounce = max(3.0, min(debounce, 120.0))
    with _lock:
        if now - _last_fire_monotonic < debounce:
            return
        _last_fire_monotonic = now

    def _worker() -> None:
        db = SessionLocal()
        try:
            out = poll_once(db)
            committed = commit_poll_transaction_if_modified(db)
            if out.get("ok") or committed:
                logger.info(
                    "player-triggered powerball poll ok=%s committed=%s repaired=%s reason=%s",
                    bool(out.get("ok")),
                    committed,
                    out.get("repaired_settlements"),
                    reason or "-",
                )
        except Exception:
            logger.exception("player-triggered powerball poll failed reason=%s", reason or "-")
            try:
                db.rollback()
            except Exception:
                pass
        finally:
            db.close()

    threading.Thread(target=_worker, name="gp-powerball-poll", daemon=True).start()
