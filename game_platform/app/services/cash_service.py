"""
입출금 신청 서비스.
- 신청 생성 → WS 알림 (관리자에게 실시간 사운드 트리거)
- 승인    → game_money_ledger INSERT + 잔고 갱신 (단일 트랜잭션)
- 거절    → 상태만 REJECTED로
모든 처리는 AuditService로 기록.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.cash_request import CashRequest
from app.models.enums import GameMoneyLedgerReason
from app.models.ledger import GameMoneyLedgerEntry
from app.models.user import User
from app.services.audit_service import AuditService
from app.services.deposit_bonus_service import apply_deposit_bonuses_on_approve


# 롤링 충족 배수: 입금액 × multiplier = 필요 배팅액
ROLLING_MULTIPLIER_DEFAULT = Decimal("1")


class CashService:
    @staticmethod
    def create_deposit_request(
        db: Session,
        *,
        user_id: int,
        amount: Decimal,
        memo: Optional[str] = None,
        rolling_multiplier: Decimal = ROLLING_MULTIPLIER_DEFAULT,
    ) -> CashRequest:
        req = CashRequest(
            user_id=user_id,
            request_type="DEPOSIT",
            status="PENDING",
            amount=amount,
            memo=memo,
            required_rolling_amount=(amount * rolling_multiplier).quantize(Decimal("0.000001")),
        )
        db.add(req)
        db.flush()
        return req

    @staticmethod
    def create_withdraw_request(
        db: Session,
        *,
        user_id: int,
        amount: Decimal,
        memo: Optional[str] = None,
    ) -> CashRequest:
        user = db.scalars(select(User).where(User.id == user_id).with_for_update()).one()
        if user.game_money_balance < amount:
            raise ValueError(f"잔고 부족 (보유: {user.game_money_balance})")
        req = CashRequest(
            user_id=user_id,
            request_type="WITHDRAW",
            status="PENDING",
            amount=amount,
            memo=memo,
        )
        db.add(req)
        db.flush()
        return req

    @staticmethod
    def approve(
        db: Session,
        *,
        request_id: int,
        actor: User,
        actor_ip: Optional[str] = None,
    ) -> CashRequest:
        req = db.scalars(
            select(CashRequest).where(CashRequest.id == request_id).with_for_update()
        ).one_or_none()
        if req is None:
            raise ValueError("신청 없음")
        if req.status not in ("PENDING", "PROCESSING"):
            raise ValueError(f"이미 처리됨 ({req.status})")

        user = db.scalars(select(User).where(User.id == req.user_id).with_for_update()).one()
        old_balance = user.game_money_balance

        if req.request_type == "DEPOSIT":
            delta = req.amount
            reason = GameMoneyLedgerReason.ADMIN_CREDIT.value
        else:  # WITHDRAW
            if user.game_money_balance < req.amount:
                raise ValueError("처리 시점 잔고 부족")
            delta = -req.amount
            reason = GameMoneyLedgerReason.ADMIN_DEBIT.value

        new_bal = user.game_money_balance + delta
        user.game_money_balance = new_bal

        db.add(
            GameMoneyLedgerEntry(
                user_id=user.id,
                delta=delta,
                balance_after=new_bal,
                reason=reason,
                reference_type="CASH_REQUEST",
                reference_id=str(req.id),
            )
        )

        if req.request_type == "DEPOSIT":
            mult = (
                (req.required_rolling_amount / req.amount).quantize(Decimal("0.000001"))
                if req.amount and req.amount > 0
                else ROLLING_MULTIPLIER_DEFAULT
            )
            apply_deposit_bonuses_on_approve(db, req=req, depositor=user, rolling_multiplier=mult)

        req.status = "APPROVED"
        req.processed_by = actor.id
        req.processed_at = datetime.now(timezone.utc)

        AuditService.log(
            db,
            actor=actor,
            action="CASH_APPROVE",
            target_type="CASH_REQUEST",
            target_id=str(req.id),
            before={"status": "PENDING", "balance": str(old_balance)},
            after={
                "status": "APPROVED",
                "balance": str(user.game_money_balance),
                "type": req.request_type,
            },
            actor_ip=actor_ip,
        )
        db.flush()
        return req

    @staticmethod
    def reject(
        db: Session,
        *,
        request_id: int,
        actor: User,
        reason: str = "",
        actor_ip: Optional[str] = None,
    ) -> CashRequest:
        req = db.scalars(
            select(CashRequest).where(CashRequest.id == request_id).with_for_update()
        ).one_or_none()
        if req is None:
            raise ValueError("신청 없음")
        if req.status not in ("PENDING", "PROCESSING"):
            raise ValueError(f"이미 처리됨 ({req.status})")

        req.status = "REJECTED"
        req.processed_by = actor.id
        req.processed_at = datetime.now(timezone.utc)
        req.reject_reason = reason

        AuditService.log(
            db,
            actor=actor,
            action="CASH_REJECT",
            target_type="CASH_REQUEST",
            target_id=str(req.id),
            before={"status": "PENDING"},
            after={"status": "REJECTED", "reason": reason},
            actor_ip=actor_ip,
        )
        db.flush()
        return req


def cash_request_to_dict(req: CashRequest) -> Dict[str, Any]:
    return {
        "id": req.id,
        "user_id": req.user_id,
        "request_type": req.request_type,
        "status": req.status,
        "amount": str(req.amount),
        "memo": req.memo,
        "required_rolling_amount": str(req.required_rolling_amount),
        "processed_by": req.processed_by,
        "processed_at": req.processed_at.isoformat() if req.processed_at else None,
        "reject_reason": req.reject_reason,
        "created_at": req.created_at.isoformat() if req.created_at else None,
    }
