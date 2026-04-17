"""입금 승인 시 `site_policies.level_bonuses` 기반 보너스 지급."""
from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, Tuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.cash_request import CashRequest
from app.models.enums import GameMoneyLedgerReason
from app.models.ledger import GameMoneyLedgerEntry
from app.models.site_config import SiteConfig
from app.models.user import User
from app.services.site_policy_service import policies_dict

Q = Decimal("0.000001")


def _level_row(level_bonuses: Any, level: int) -> Dict[str, float]:
    if not isinstance(level_bonuses, list):
        return {}
    for row in level_bonuses:
        if not isinstance(row, dict):
            continue
        try:
            if int(row.get("level", 0)) == int(level):
                return {
                    "first": float(row.get("first_deposit_pct") or 0),
                    "every": float(row.get("every_deposit_pct") or 0),
                    "ref": float(row.get("referral_deposit_pct") or 0),
                }
        except (TypeError, ValueError):
            continue
    return {}


def _prior_approved_deposit_count(db: Session, user_id: int) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(CashRequest)
            .where(
                CashRequest.user_id == user_id,
                CashRequest.request_type == "DEPOSIT",
                CashRequest.status == "APPROVED",
            )
        )
        or 0
    )


def apply_deposit_bonuses_on_approve(
    db: Session,
    *,
    req: CashRequest,
    depositor: User,
    rolling_multiplier: Decimal,
) -> Tuple[Decimal, Decimal]:
    """
    입금 원금 반영 후 같은 트랜잭션에서 호출.
    반환: (본인 보너스 합, 추천인 보너스 합) — 롤링 추가분 계산용.
    """
    if req.request_type != "DEPOSIT":
        return Decimal("0"), Decimal("0")

    site = db.get(SiteConfig, depositor.site_id)
    if site is None:
        return Decimal("0"), Decimal("0")

    pol = policies_dict(site)
    lb = pol.get("level_bonuses")
    row = _level_row(lb, max(1, min(99, int(depositor.member_level or 1))))

    prior = _prior_approved_deposit_count(db, depositor.id)
    is_first = prior == 0
    rk = "first" if is_first else "every"
    pct_self = Decimal(str(row.get(rk, 0) or 0))
    bonus_self = (req.amount * pct_self / Decimal("100")).quantize(Q)
    bonus_referrer_total = Decimal("0")

    if bonus_self > 0:
        depositor.game_money_balance = depositor.game_money_balance + bonus_self
        db.add(
            GameMoneyLedgerEntry(
                user_id=depositor.id,
                delta=bonus_self,
                balance_after=depositor.game_money_balance,
                reason=(
                    GameMoneyLedgerReason.DEPOSIT_BONUS_FIRST.value
                    if is_first
                    else GameMoneyLedgerReason.DEPOSIT_BONUS_REPEAT.value
                ),
                reference_type="CASH_REQUEST",
                reference_id=str(req.id),
            )
        )
        extra_roll = (bonus_self * rolling_multiplier).quantize(Q)
        if extra_roll > 0:
            req.required_rolling_amount = (req.required_rolling_amount + extra_roll).quantize(Q)

    if depositor.referrer_id:
        ref = db.scalars(
            select(User).where(User.id == depositor.referrer_id).with_for_update()
        ).one_or_none()
        if ref is not None:
            rrow = _level_row(lb, max(1, min(99, int(ref.member_level or 1))))
            pct_ref = Decimal(str(rrow.get("ref", 0) or 0))
            bref = (req.amount * pct_ref / Decimal("100")).quantize(Q)
            if bref > 0:
                ref.game_money_balance = ref.game_money_balance + bref
                bonus_referrer_total = bref
                db.add(
                    GameMoneyLedgerEntry(
                        user_id=ref.id,
                        delta=bref,
                        balance_after=ref.game_money_balance,
                        reason=GameMoneyLedgerReason.DEPOSIT_BONUS_REFERRAL.value,
                        reference_type="CASH_REQUEST",
                        reference_id=str(req.id),
                    )
                )

    return bonus_self, bonus_referrer_total
