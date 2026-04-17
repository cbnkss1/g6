"""배팅 생성(스테이크 차감) — 정산과 분리된 서비스."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.bet import BetHistory
from app.models.enums import BetStatus, GameMoneyLedgerReason
from app.models.ledger import GameMoneyLedgerEntry
from app.models.user import User


@dataclass(frozen=True)
class PlaceBetResult:
    ok: bool
    bet_id: Optional[int]
    detail: str


class BetPlacementService:
    @classmethod
    def place_pending_bet(
        cls,
        db: Session,
        *,
        user_id: int,
        external_bet_uid: str,
        game_type: str,
        stake: Decimal,
    ) -> PlaceBetResult:
        stake = Decimal(stake).quantize(Decimal("0.000001"))
        user = db.scalars(select(User).where(User.id == user_id).with_for_update()).one()

        if user.game_money_balance < stake:
            return PlaceBetResult(ok=False, bet_id=None, detail="insufficient game money")

        new_bal = user.game_money_balance - stake
        user.game_money_balance = new_bal
        db.add(
            GameMoneyLedgerEntry(
                user_id=user.id,
                delta=-stake,
                balance_after=new_bal,
                reason=GameMoneyLedgerReason.BET_STAKE.value,
                reference_type="BET_STAKE",
                reference_id=external_bet_uid,
            )
        )
        bet = BetHistory(
            external_bet_uid=external_bet_uid,
            user_id=user_id,
            game_type=game_type,
            status=BetStatus.PENDING.value,
            bet_amount=stake,
        )
        db.add(bet)
        db.flush()
        return PlaceBetResult(ok=True, bet_id=bet.id, detail="pending")
