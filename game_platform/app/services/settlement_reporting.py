"""파트너 롤링 정산 투명성: 유효 배팅 × 요율 = 지급액 검증용 라인."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Collection, Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy import Integer, cast, select
from sqlalchemy.orm import Session, aliased

from app.models.bet import BetHistory
from app.models.enums import RollingPointLedgerReason
from app.models.ledger import RollingPointLedgerEntry
from app.models.user import User, UserGameRollingRate
from app.services.settlement_basis import valid_bet_amount_for_rolling


def utc_day_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


@dataclass(frozen=True)
class RollingSettlementLine:
    ledger_id: int
    credited_at: datetime
    referrer_login_id: str
    player_login_id: str
    game_type: str
    bet_id: int
    total_bet: Decimal
    valid_bet: Decimal
    configured_rate_percent: Decimal
    rolling_paid: Decimal
    implied_rate_percent: Decimal
    game_result: str

    def as_dict(self) -> Dict[str, Any]:
        return {
            "ledger_id": self.ledger_id,
            "credited_at": self.credited_at.isoformat(),
            "referrer_login_id": self.referrer_login_id,
            "player_login_id": self.player_login_id,
            "game_type": self.game_type,
            "bet_id": self.bet_id,
            "total_bet": str(self.total_bet.quantize(Decimal("0.000001"))),
            "valid_bet": str(self.valid_bet.quantize(Decimal("0.000001"))),
            "configured_rate_percent": str(self.configured_rate_percent.quantize(Decimal("0.0001"))),
            "rolling_paid": str(self.rolling_paid.quantize(Decimal("0.000001"))),
            "implied_rate_percent": str(self.implied_rate_percent.quantize(Decimal("0.0001"))),
            "game_result": self.game_result,
        }


def _rate_map(
    db: Session, pairs: List[Tuple[int, str]]
) -> Dict[Tuple[int, str], Decimal]:
    if not pairs:
        return {}
    out: Dict[Tuple[int, str], Decimal] = {}
    for uid, gt in pairs:
        row = db.scalars(
            select(UserGameRollingRate).where(
                UserGameRollingRate.user_id == uid,
                UserGameRollingRate.game_type == gt,
            )
        ).one_or_none()
        out[(uid, gt)] = row.rate_percent if row else Decimal("0")
    return out


def get_rolling_settlement_lines(
    db: Session,
    *,
    site_id: Optional[UUID],
    super_admin: bool,
    day_start: Optional[datetime] = None,
    scope_subtree_user_ids: Optional[Collection[int]] = None,
) -> Dict[str, Any]:
    start = day_start or utc_day_start()
    Player = aliased(User)
    Referrer = aliased(User)

    stmt = (
        select(RollingPointLedgerEntry, BetHistory, Player, Referrer)
        .join(
            BetHistory,
            BetHistory.id == cast(RollingPointLedgerEntry.reference_id, Integer),
        )
        .join(Player, Player.id == BetHistory.user_id)
        .join(Referrer, Referrer.id == RollingPointLedgerEntry.user_id)
        .where(
            RollingPointLedgerEntry.reason == RollingPointLedgerReason.REFERRAL_ROLLING.value,
            RollingPointLedgerEntry.created_at >= start,
            RollingPointLedgerEntry.reference_type == "BET",
            RollingPointLedgerEntry.reference_id.isnot(None),
            RollingPointLedgerEntry.reference_id.op("~")("^[0-9]+$"),
        )
        .order_by(RollingPointLedgerEntry.created_at.desc())
    )
    if scope_subtree_user_ids is not None:
        ids = tuple(scope_subtree_user_ids)
        if ids:
            stmt = stmt.where(
                Player.id.in_(ids),
                Referrer.id.in_(ids),
            )
        else:
            stmt = stmt.where(Player.id == -1)
        if not super_admin and site_id is not None:
            stmt = stmt.where(
                Player.site_id == site_id,
                Referrer.site_id == site_id,
            )
    elif not super_admin and site_id is not None:
        stmt = stmt.where(Player.site_id == site_id)

    rows = db.execute(stmt).all()
    pairs = [(b.user_id, b.game_type) for _, b, _, _ in rows]
    rates = _rate_map(db, list(dict.fromkeys(pairs)))

    lines: List[RollingSettlementLine] = []
    sum_total = Decimal("0")
    sum_valid = Decimal("0")
    sum_roll = Decimal("0")

    for r_ent, bet, pl, ref in rows:
        total = Decimal(bet.bet_amount).quantize(Decimal("0.000001"))
        valid = valid_bet_amount_for_rolling(bet.bet_amount, bet.game_result)
        paid = Decimal(r_ent.delta).quantize(Decimal("0.000001"))
        cfg_rate = rates.get((bet.user_id, bet.game_type), Decimal("0")).quantize(
            Decimal("0.0001")
        )
        if valid > 0:
            implied = (paid / valid * Decimal("100")).quantize(Decimal("0.0001"))
        else:
            implied = Decimal("0")

        lines.append(
            RollingSettlementLine(
                ledger_id=r_ent.id,
                credited_at=r_ent.created_at,
                referrer_login_id=ref.login_id,
                player_login_id=pl.login_id,
                game_type=bet.game_type,
                bet_id=bet.id,
                total_bet=total,
                valid_bet=valid,
                configured_rate_percent=cfg_rate,
                rolling_paid=paid,
                implied_rate_percent=implied,
                game_result=bet.game_result or "",
            )
        )
        sum_total += total
        sum_valid += valid
        sum_roll += paid

    return {
        "day_start_utc": start.isoformat(),
        "lines": [ln.as_dict() for ln in lines],
        "totals": {
            "total_bet_sum": str(sum_total.quantize(Decimal("0.000001"))),
            "valid_bet_sum": str(sum_valid.quantize(Decimal("0.000001"))),
            "rolling_paid_sum": str(sum_roll.quantize(Decimal("0.000001"))),
        },
    }
