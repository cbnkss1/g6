"""
스포츠(SportsBet) ↔ 통합 배팅 로그(gp_bet_history) 연동.

관리자 `/admin/bets/history-lines` 가 파워볼처럼 스포츠도 보이도록 함.
external_bet_uid = gp_sp_{sports_bet_id}
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.bet import BetHistory
from app.models.enums import BetStatus
from app.models.sports import SportsBet


def create_bet_history_for_sports_bet(
    db: Session, *, user_id: int, sports_bet_id: int, stake: Decimal
) -> None:
    db.add(
        BetHistory(
            external_bet_uid=f"gp_sp_{sports_bet_id}",
            user_id=user_id,
            game_type="SPORTS",
            status=BetStatus.PENDING.value,
            bet_amount=stake,
        )
    )


def sync_bet_history_after_sports_settle(
    db: Session, bet: SportsBet, *, settled_at: datetime
) -> None:
    """WON / LOST / VOIDED 최종 확정 시에만 호출. PARTIAL_VOID 는 호출하지 않음."""
    ext = f"gp_sp_{bet.id}"
    hist = db.scalar(
        select(BetHistory).where(BetHistory.external_bet_uid == ext).with_for_update()
    )
    if hist is None:
        return
    st = (bet.status or "").upper()
    if st not in ("WON", "LOST", "VOIDED", "CANCELLED"):
        return
    hist.status = BetStatus.SETTLED.value
    hist.settled_at = settled_at
    if st == "WON":
        hist.game_result = "WIN"
        hist.win_amount = bet.win_amount or Decimal("0")
    elif st == "LOST":
        hist.game_result = "LOSE"
        hist.win_amount = Decimal("0")
    else:
        hist.game_result = "VOID"
        # 적특·취소 시 원금 환불액 — 순손실·표시와 정합
        hist.win_amount = bet.stake if (bet.stake is not None) else Decimal("0")
