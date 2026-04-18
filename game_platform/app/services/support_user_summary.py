"""고객센터·문의 화면용 유저 요약 (충환전 합계 등)."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.cash_request import CashRequest
from app.models.user import User


@dataclass(frozen=True)
class SupportUserSummary:
    user_id: int
    login_id: str
    display_name: Optional[str]
    member_level: int
    registered_at: Optional[str]
    total_deposit_approved: Decimal
    total_withdraw_approved: Decimal
    bad_actor: bool
    game_money_balance: Decimal


def build_support_user_summary(db: Session, user_id: int) -> SupportUserSummary:
    u = db.get(User, user_id)
    if u is None:
        raise ValueError("user not found")

    dep = db.scalar(
        select(func.coalesce(func.sum(CashRequest.amount), 0)).where(
            CashRequest.user_id == user_id,
            CashRequest.request_type == "DEPOSIT",
            CashRequest.status == "APPROVED",
        )
    )
    wdr = db.scalar(
        select(func.coalesce(func.sum(CashRequest.amount), 0)).where(
            CashRequest.user_id == user_id,
            CashRequest.request_type == "WITHDRAW",
            CashRequest.status == "APPROVED",
        )
    )

    reg = u.created_at.isoformat() if u.created_at else None

    return SupportUserSummary(
        user_id=u.id,
        login_id=u.login_id,
        display_name=u.display_name,
        member_level=int(u.member_level or 1),
        registered_at=reg,
        total_deposit_approved=Decimal(str(dep or 0)).quantize(Decimal("0.000001")),
        total_withdraw_approved=Decimal(str(wdr or 0)).quantize(Decimal("0.000001")),
        bad_actor=bool(u.bad_actor),
        game_money_balance=Decimal(str(u.game_money_balance or 0)).quantize(Decimal("0.000001")),
    )
