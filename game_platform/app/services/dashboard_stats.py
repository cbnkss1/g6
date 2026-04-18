"""금일 집계 (대시보드·WS 페이로드)."""
from __future__ import annotations

from decimal import Decimal
from typing import Collection, Dict, Optional, Union
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.bet import BetHistory
from app.models.cash_request import CashRequest
from app.models.enums import BetStatus
from app.models.ledger import RollingPointLedgerEntry
from app.models.user import User
from app.services.kst_time import kst_day_start_utc
from app.services.total_revenue_service import ROLL_REASONS_ALL


def get_today_totals(
    db: Session,
    *,
    site_id: Optional[UUID] = None,
    super_admin: bool = False,
    scope_subtree_user_ids: Optional[Collection[int]] = None,
) -> Dict[str, Union[str, int]]:
    start = kst_day_start_utc()
    settled_today = (
        BetHistory.status == BetStatus.SETTLED.value,
        BetHistory.settled_at.is_not(None),
        BetHistory.settled_at >= start,
    )

    scope_expr = None
    if scope_subtree_user_ids is not None:
        ids = tuple(scope_subtree_user_ids)
        scope_expr = BetHistory.user_id.in_(ids) if ids else BetHistory.user_id == -1

    total_bet_q = select(func.coalesce(func.sum(BetHistory.bet_amount), 0)).where(*settled_today)
    if scope_expr is not None:
        total_bet_q = total_bet_q.where(scope_expr)
    elif not super_admin and site_id is not None:
        total_bet_q = total_bet_q.join(User, BetHistory.user_id == User.id).where(
            User.site_id == site_id
        )

    decisive = func.upper(func.coalesce(BetHistory.game_result, "")).in_(("WIN", "LOSE"))
    valid_bet_expr = case((decisive, BetHistory.bet_amount), else_=0)
    valid_bet_q = select(func.coalesce(func.sum(valid_bet_expr), 0)).where(*settled_today)
    if scope_expr is not None:
        valid_bet_q = valid_bet_q.where(scope_expr)
    elif not super_admin and site_id is not None:
        valid_bet_q = valid_bet_q.join(User, BetHistory.user_id == User.id).where(
            User.site_id == site_id
        )

    # `total_revenue_service` 와 동일: 레거시 추천 롤링 + 본인/차액 롤링 + 차액 루징(롤링포인트 원장)
    rolling_q = select(func.coalesce(func.sum(RollingPointLedgerEntry.delta), 0)).where(
        RollingPointLedgerEntry.reason.in_(ROLL_REASONS_ALL),
        RollingPointLedgerEntry.created_at >= start,
    )
    if scope_subtree_user_ids is not None:
        ids = tuple(scope_subtree_user_ids)
        if ids:
            rolling_q = rolling_q.where(RollingPointLedgerEntry.user_id.in_(ids))
        else:
            rolling_q = rolling_q.where(RollingPointLedgerEntry.user_id == -1)
    elif not super_admin and site_id is not None:
        rolling_q = rolling_q.join(User, RollingPointLedgerEntry.user_id == User.id).where(
            User.site_id == site_id
        )

    cnt_q = select(func.count()).select_from(BetHistory).where(
        BetHistory.status == BetStatus.SETTLED.value,
        BetHistory.settled_at.is_not(None),
        BetHistory.settled_at >= start,
    )
    if scope_expr is not None:
        cnt_q = cnt_q.where(scope_expr)
    elif not super_admin and site_id is not None:
        cnt_q = cnt_q.join(User, BetHistory.user_id == User.id).where(User.site_id == site_id)

    total_bet = Decimal(db.scalar(total_bet_q) or 0)
    valid_bet = Decimal(db.scalar(valid_bet_q) or 0)
    rolling_total = db.scalar(rolling_q)
    cnt = db.scalar(cnt_q)
    r = Decimal(rolling_total or 0)
    q_total = total_bet.quantize(Decimal("0.000001"))
    q_valid = valid_bet.quantize(Decimal("0.000001"))
    q_roll = r.quantize(Decimal("0.000001"))
    return {
        # 대시보드 볼륨(타이·취소·적특 포함)
        "today_total_bet": str(q_total),
        # 정산·롤링 기준(승·패만)
        "today_valid_bet": str(q_valid),
        # 하위 호환: 예전 필드명 = 총 배팅 볼륨
        "today_bet_total": str(q_total),
        "today_rolling_total": str(q_roll),
        "today_settled_count": int(cnt or 0),
    }


def _cash_scope(stmt, *, super_admin: bool, site_id: Optional[UUID], scope_subtree_user_ids):
    if super_admin:
        return stmt
    if scope_subtree_user_ids is not None:
        ids = tuple(scope_subtree_user_ids)
        if not ids:
            return stmt.where(CashRequest.user_id == -1)
        return stmt.where(CashRequest.user_id.in_(ids))
    if site_id is not None:
        return stmt.join(User, CashRequest.user_id == User.id).where(User.site_id == site_id)
    return stmt


def get_cash_dashboard_metrics(
    db: Session,
    *,
    site_id: Optional[UUID] = None,
    super_admin: bool = False,
    scope_subtree_user_ids: Optional[Collection[int]] = None,
) -> Dict[str, Union[str, int]]:
    """입출금 대기 건수 + 금일 승인 합계 (대시보드·WS)."""
    start = kst_day_start_utc()
    pend_dep = select(func.count()).select_from(CashRequest).where(
        CashRequest.request_type == "DEPOSIT",
        CashRequest.status.in_(("PENDING", "PROCESSING")),
    )
    pend_dep = _cash_scope(pend_dep, super_admin=super_admin, site_id=site_id, scope_subtree_user_ids=scope_subtree_user_ids)

    pend_wdr = select(func.count()).select_from(CashRequest).where(
        CashRequest.request_type == "WITHDRAW",
        CashRequest.status.in_(("PENDING", "PROCESSING")),
    )
    pend_wdr = _cash_scope(pend_wdr, super_admin=super_admin, site_id=site_id, scope_subtree_user_ids=scope_subtree_user_ids)

    appr_dep = select(func.coalesce(func.sum(CashRequest.amount), 0)).where(
        CashRequest.request_type == "DEPOSIT",
        CashRequest.status == "APPROVED",
        CashRequest.processed_at.is_not(None),
        CashRequest.processed_at >= start,
    )
    appr_dep = _cash_scope(appr_dep, super_admin=super_admin, site_id=site_id, scope_subtree_user_ids=scope_subtree_user_ids)

    appr_wdr = select(func.coalesce(func.sum(CashRequest.amount), 0)).where(
        CashRequest.request_type == "WITHDRAW",
        CashRequest.status == "APPROVED",
        CashRequest.processed_at.is_not(None),
        CashRequest.processed_at >= start,
    )
    appr_wdr = _cash_scope(appr_wdr, super_admin=super_admin, site_id=site_id, scope_subtree_user_ids=scope_subtree_user_ids)

    d1 = int(db.scalar(pend_dep) or 0)
    d2 = int(db.scalar(pend_wdr) or 0)
    s_dep = Decimal(db.scalar(appr_dep) or 0)
    s_wdr = Decimal(db.scalar(appr_wdr) or 0)
    return {
        "pending_deposit_requests": d1,
        "pending_withdraw_requests": d2,
        "today_deposit_approved_sum": str(s_dep.quantize(Decimal("0.000001"))),
        "today_withdraw_approved_sum": str(s_wdr.quantize(Decimal("0.000001"))),
    }
