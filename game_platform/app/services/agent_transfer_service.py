"""
에이전트 선불형 P2P: 매장(is_store_enabled) → 하부 지급 / 하부에서 회수.
데드락 방지: 두 유저 id 오름차순으로 FOR UPDATE.
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import GameMoneyLedgerReason
from app.models.ledger import GameMoneyLedgerEntry
from app.models.user import User


def is_downline_of(db: Session, ancestor_id: int, descendant_id: int) -> bool:
    """ancestor의 추천 트리(무한 뎁스) 아래에 descendant가 있는지."""
    if descendant_id == ancestor_id:
        return False
    uid: Optional[int] = descendant_id
    seen: set[int] = set()
    while uid is not None:
        if uid in seen:
            return False
        seen.add(uid)
        row = db.get(User, uid)
        if row is None:
            return False
        if row.referrer_id == ancestor_id:
            return True
        uid = row.referrer_id
    return False


def _lock_two_users(db: Session, id_a: int, id_b: int) -> Tuple[User, User]:
    low, high = (id_a, id_b) if id_a < id_b else (id_b, id_a)
    u_low = db.scalars(select(User).where(User.id == low).with_for_update()).one()
    u_high = db.scalars(select(User).where(User.id == high).with_for_update()).one()
    return (u_low, u_high)


def agent_p2p_transfer(
    db: Session,
    *,
    agent: User,
    counterparty_user_id: int,
    amount: Decimal,
    direction: str,
) -> dict:
    """
    direction: pay = agent → counterparty, collect = counterparty → agent
    """
    if not agent.is_store_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Offline store (is_store_enabled) is not enabled for your account",
        )
    if counterparty_user_id == agent.id:
        raise HTTPException(status_code=400, detail="cannot transfer to self")

    amt = Decimal(amount).quantize(Decimal("0.000001"))
    if amt <= 0:
        raise HTTPException(status_code=400, detail="amount must be positive")

    cp = db.get(User, counterparty_user_id)
    if cp is None:
        raise HTTPException(status_code=404, detail="counterparty not found")
    if cp.site_id != agent.site_id:
        raise HTTPException(status_code=403, detail="counterparty not in your site")
    if not is_downline_of(db, agent.id, counterparty_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="counterparty is not in your downline tree",
        )

    u_low, u_high = _lock_two_users(db, agent.id, counterparty_user_id)
    agent_row = u_low if u_low.id == agent.id else u_high
    cp_row = u_low if u_low.id == counterparty_user_id else u_high

    ref = str(uuid.uuid4())[:36]

    if direction == "pay":
        if agent_row.game_money_balance < amt:
            raise HTTPException(
                status_code=400,
                detail="insufficient game money balance for pay-out",
            )
        agent_row.game_money_balance = (agent_row.game_money_balance - amt).quantize(
            Decimal("0.000001")
        )
        cp_row.game_money_balance = (cp_row.game_money_balance + amt).quantize(
            Decimal("0.000001")
        )
        db.add(
            GameMoneyLedgerEntry(
                user_id=agent_row.id,
                delta=-amt,
                balance_after=agent_row.game_money_balance,
                reason=GameMoneyLedgerReason.AGENT_STORE_PAY_OUT.value,
                reference_type="AGENT_P2P",
                reference_id=ref,
            )
        )
        db.add(
            GameMoneyLedgerEntry(
                user_id=cp_row.id,
                delta=amt,
                balance_after=cp_row.game_money_balance,
                reason=GameMoneyLedgerReason.AGENT_STORE_PAY_IN.value,
                reference_type="AGENT_P2P",
                reference_id=ref,
            )
        )
    elif direction == "collect":
        if cp_row.game_money_balance < amt:
            raise HTTPException(
                status_code=400,
                detail="insufficient game money balance on counterparty for collect",
            )
        cp_row.game_money_balance = (cp_row.game_money_balance - amt).quantize(
            Decimal("0.000001")
        )
        agent_row.game_money_balance = (agent_row.game_money_balance + amt).quantize(
            Decimal("0.000001")
        )
        db.add(
            GameMoneyLedgerEntry(
                user_id=cp_row.id,
                delta=-amt,
                balance_after=cp_row.game_money_balance,
                reason=GameMoneyLedgerReason.AGENT_STORE_COLLECT_OUT.value,
                reference_type="AGENT_P2P",
                reference_id=ref,
            )
        )
        db.add(
            GameMoneyLedgerEntry(
                user_id=agent_row.id,
                delta=amt,
                balance_after=agent_row.game_money_balance,
                reason=GameMoneyLedgerReason.AGENT_STORE_COLLECT_IN.value,
                reference_type="AGENT_P2P",
                reference_id=ref,
            )
        )
    else:
        raise HTTPException(status_code=400, detail="direction must be pay or collect")

    return {
        "ok": True,
        "reference_id": ref,
        "direction": direction,
        "amount": str(amt),
        "agent_balance_after": str(agent_row.game_money_balance),
        "counterparty_balance_after": str(cp_row.game_money_balance),
    }
