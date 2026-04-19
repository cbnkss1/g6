"""
전체 수익 현황: 선택 상위 기준 **본인+전체 하부** 합산 행 + 직속 하부(추천 1단)별 행.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy import String, cast, func, select
from sqlalchemy.orm import Session

from app.models.bet import BetHistory
from app.models.cash_request import CashRequest
from app.models.enums import BetStatus, RollingPointLedgerReason
from app.models.ledger import RollingPointLedgerEntry
from app.models.user import User, UserGameRollingRate
from app.services.downline_subtree import downward_subtree_user_ids
from app.services.kst_time import kst_calendar_window_utc

Q = Decimal("0.000001")

# settlement_reporting / 리그 집계와 동일 구간 (카지노·슬롯)
_GAME_TYPES_CASINO = ("BACCARAT", "CASINO", "LIVE_CASINO")
_GAME_TYPES_SLOT = ("SLOT",)
_GAME_TYPES_POWERBALL = ("POWERBALL",)
_GAME_TYPES_SPORTS = ("SPORTS",)


def _game_types_for_vertical(vertical: Optional[str]) -> Optional[Tuple[str, ...]]:
    if not vertical or vertical == "all":
        return None
    v = vertical.strip().lower()
    if v == "casino":
        return _GAME_TYPES_CASINO
    if v == "slot":
        return _GAME_TYPES_SLOT
    if v == "powerball":
        return _GAME_TYPES_POWERBALL
    if v == "sports":
        return _GAME_TYPES_SPORTS
    return None


def _assert_parent_visible(
    db: Session,
    *,
    admin: User,
    parent_id: int,
    super_admin: bool,
) -> User:
    parent = db.get(User, parent_id)
    if parent is None:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="parent not found")
    if super_admin:
        return parent
    allowed = downward_subtree_user_ids(db, admin.id)
    if parent_id not in allowed:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="해당 상위 회원에 대한 권한이 없습니다.",
        )
    return parent


def _sum_cash_total(
    db: Session,
    user_ids: Tuple[int, ...],
    t0: datetime,
    t1: datetime,
    request_type: str,
) -> Decimal:
    if not user_ids:
        return Decimal("0").quantize(Q)
    stmt = select(func.coalesce(func.sum(CashRequest.amount), 0)).where(
        CashRequest.user_id.in_(user_ids),
        CashRequest.request_type == request_type,
        CashRequest.status == "APPROVED",
        CashRequest.processed_at.is_not(None),
        CashRequest.processed_at >= t0,
        CashRequest.processed_at < t1,
    )
    return Decimal(str(db.scalar(stmt) or 0)).quantize(Q)


def _sum_bets_total(
    db: Session,
    user_ids: Tuple[int, ...],
    t0: datetime,
    t1: datetime,
    game_types: Optional[Tuple[str, ...]] = None,
) -> Tuple[Decimal, Decimal]:
    """하부 전체: 합산 스테이크·당첨. ``game_types`` 가 있으면 해당 종목만."""
    if not user_ids:
        z = Decimal("0").quantize(Q)
        return z, z
    cond = [
        BetHistory.user_id.in_(user_ids),
        BetHistory.status == BetStatus.SETTLED.value,
        BetHistory.settled_at.is_not(None),
        BetHistory.settled_at >= t0,
        BetHistory.settled_at < t1,
    ]
    if game_types:
        cond.append(BetHistory.game_type.in_(game_types))
    stmt = select(
        func.coalesce(func.sum(BetHistory.bet_amount), 0),
        func.coalesce(func.sum(BetHistory.win_amount), 0),
    ).where(*cond)
    row = db.execute(stmt).one()
    st = Decimal(str(row[0] or 0)).quantize(Q)
    wi = Decimal(str(row[1] or 0)).quantize(Q)
    return st, wi


def _sum_rolling_delta(
    db: Session,
    user_ids: Tuple[int, ...],
    t0: datetime,
    t1: datetime,
    reasons: Tuple[str, ...],
    game_types: Optional[Tuple[str, ...]] = None,
) -> Decimal:
    """
    해당 user_id 집합에 대한 롤링 원장 delta 합(음수 허용).
    ``game_types`` 가 있으면 ``reference_type=BET`` 인 줄만 해당 배팅 종목으로 제한.
    """
    if not user_ids:
        return Decimal("0").quantize(Q)
    if game_types is None:
        stmt = select(func.coalesce(func.sum(RollingPointLedgerEntry.delta), 0)).where(
            RollingPointLedgerEntry.user_id.in_(user_ids),
            RollingPointLedgerEntry.reason.in_(reasons),
            RollingPointLedgerEntry.created_at >= t0,
            RollingPointLedgerEntry.created_at < t1,
        )
    else:
        stmt = (
            select(func.coalesce(func.sum(RollingPointLedgerEntry.delta), 0))
            .select_from(RollingPointLedgerEntry)
            .join(
                BetHistory,
                (RollingPointLedgerEntry.reference_type == "BET")
                & (RollingPointLedgerEntry.reference_id == cast(BetHistory.id, String)),
            )
            .where(
                RollingPointLedgerEntry.user_id.in_(user_ids),
                RollingPointLedgerEntry.reason.in_(reasons),
                RollingPointLedgerEntry.created_at >= t0,
                RollingPointLedgerEntry.created_at < t1,
                BetHistory.game_type.in_(game_types),
            )
        )
    return Decimal(str(db.scalar(stmt) or 0)).quantize(Q)


def _effective_losing_percent_partner_period(
    db: Session,
    partner_user_id: int,
    bettor_ids: Tuple[int, ...],
    t0: datetime,
    t1: datetime,
    game_types: Optional[Tuple[str, ...]] = None,
) -> Decimal:
    """
    기간·하부 서브트리 정산 스테이크를 종목별로 가중한 해당 행 파트너의 유효 루징(%).
    기간 내 정산 배팅이 없으면 등록된 losing_rate 중 최댓값.
    """
    if not bettor_ids:
        return Decimal("0")
    settled = [
        BetHistory.user_id.in_(bettor_ids),
        BetHistory.status == BetStatus.SETTLED.value,
        BetHistory.settled_at.is_not(None),
        BetHistory.settled_at >= t0,
        BetHistory.settled_at < t1,
    ]
    if game_types:
        settled.append(BetHistory.game_type.in_(game_types))
    rows = list(
        db.execute(
            select(BetHistory.game_type, func.coalesce(func.sum(BetHistory.bet_amount), 0))
            .where(*settled)
            .group_by(BetHistory.game_type)
        ).all()
    )
    total_stake = sum(Decimal(str(r[1] or 0)) for r in rows)
    if total_stake <= 0:
        rates = list(
            db.scalars(
                select(UserGameRollingRate).where(UserGameRollingRate.user_id == partner_user_id)
            ).all()
        )
        if not rates:
            return Decimal("0")
        return max(Decimal(str(r.losing_rate_percent)) for r in rates).quantize(Decimal("0.0001"))
    wl_n = Decimal("0")
    for game_type, st_amt in rows:
        st_amt = Decimal(str(st_amt or 0))
        if st_amt <= 0:
            continue
        gt = (game_type or "").strip().upper()[:32]
        row = db.scalars(
            select(UserGameRollingRate).where(
                UserGameRollingRate.user_id == partner_user_id,
                UserGameRollingRate.game_type == gt,
            ).limit(1)
        ).first()
        lr = Decimal(str(row.losing_rate_percent)) if row else Decimal("0")
        wl_n += st_amt * lr
    return (wl_n / total_stake).quantize(Decimal("0.0001"))


ROLL_REASONS_ALL = (
    RollingPointLedgerReason.REFERRAL_ROLLING.value,
    RollingPointLedgerReason.SELF_ROLLING.value,
    RollingPointLedgerReason.DIFFERENTIAL_ROLLING.value,
    RollingPointLedgerReason.DIFFERENTIAL_LOSING.value,
)
# 하부·차액에서 올라온 롤링(본인 배팅 본인 롤링 제외)
ROLL_FROM_MEMBERS = (
    RollingPointLedgerReason.REFERRAL_ROLLING.value,
    RollingPointLedgerReason.DIFFERENTIAL_ROLLING.value,
)
ROLL_REASONS_ROLLING_ONLY = (
    RollingPointLedgerReason.REFERRAL_ROLLING.value,
    RollingPointLedgerReason.SELF_ROLLING.value,
    RollingPointLedgerReason.DIFFERENTIAL_ROLLING.value,
)
ROLL_SELF_ONLY = (RollingPointLedgerReason.SELF_ROLLING.value,)
# 롤링포인트 원장이지만 성격은 루징(차액) — 순수 롤링 합과 섞지 않음
ROLL_REASONS_DIFF_LOSING_ONLY = (RollingPointLedgerReason.DIFFERENTIAL_LOSING.value,)


def _build_revenue_row(
    db: Session,
    *,
    partner_user: User,
    ids_sub: Tuple[int, ...],
    t0: datetime,
    t1: datetime,
    gt: Optional[Tuple[str, ...]],
    has_children: bool,
    row_scope: str,
) -> Dict[str, Any]:
    """한 명(partner_user)을 루트로 한 ids_sub 집계 행. row_scope: full_subtree | direct_child."""
    d = _sum_cash_total(db, ids_sub, t0, t1, "DEPOSIT")
    w = _sum_cash_total(db, ids_sub, t0, t1, "WITHDRAW")
    net = (d - w).quantize(Q)
    st, wi = _sum_bets_total(db, ids_sub, t0, t1, gt)
    bpl = (st - wi).quantize(Q)
    r_mem = _sum_rolling_delta(db, ids_sub, t0, t1, ROLL_FROM_MEMBERS, gt)
    r_self = _sum_rolling_delta(db, ids_sub, t0, t1, ROLL_SELF_ONLY, gt)
    r_only = _sum_rolling_delta(db, ids_sub, t0, t1, ROLL_REASONS_ROLLING_ONLY, gt)
    r_lose_pt = _sum_rolling_delta(db, ids_sub, t0, t1, ROLL_REASONS_DIFF_LOSING_ONLY, gt)
    bet_settle = (bpl - r_only).quantize(Q)
    eff_l = _effective_losing_percent_partner_period(db, partner_user.id, ids_sub, t0, t1, gt)
    ls = (bet_settle * eff_l / Decimal("100")).quantize(Q)
    u = partner_user
    return {
        "user_id": u.id,
        "login_id": u.login_id,
        "display_name": (u.display_name or "").strip() or u.login_id,
        "deposit_sum": str(d),
        "withdraw_sum": str(w),
        "cash_net": str(net),
        "game_money_balance": str(Decimal(str(u.game_money_balance or 0)).quantize(Q)),
        "rolling_point_balance": str(Decimal(str(u.rolling_point_balance or 0)).quantize(Q)),
        "bet_amount": str(st),
        "win_amount": str(wi),
        "bet_profit_loss": str(bpl),
        "rolling_total": str(r_only),
        "rolling_from_members": str(r_mem),
        "rolling_self": str(r_self),
        "rolling_points": str(r_only),
        "losing_point_ledger": str(r_lose_pt),
        "losing": str(ls),
        "losing_rate_percent": str(eff_l),
        "bet_settlement": str(bet_settle),
        "has_children": has_children,
        "row_scope": row_scope,
    }


def _row_to_totals_decimals(row: Dict[str, Any]) -> Dict[str, Decimal]:
    keys = (
        "deposit_sum",
        "withdraw_sum",
        "cash_net",
        "bet_amount",
        "win_amount",
        "bet_profit_loss",
        "rolling_total",
        "rolling_from_members",
        "rolling_self",
        "rolling_points",
        "losing_point_ledger",
        "losing",
        "bet_settlement",
    )
    out: Dict[str, Decimal] = {}
    for k in keys:
        out[k] = Decimal(str(row.get(k, "0"))).quantize(Q)
    return out


def get_total_revenue_table(
    db: Session,
    *,
    admin: User,
    parent_id: int,
    date_from: date,
    date_to: date,
    super_admin: bool,
    site_id: Optional[UUID],
    vertical: Optional[str] = None,
) -> Dict[str, Any]:
    """
    - **첫 번째 행**: ``parent_id`` 기준 **본인 + 전체 하부**(하향 서브트리) 합산. 직추천이 없어도 본인 배팅·롤링이 여기 포함됨.
    - **이후 행들**: ``parent_id``의 **직속 하부** 각각에 대해, 해당 회원을 루트로 한 하부 서브트리만 집계(하위 탐색용).
    - 입출금·배팅·롤링: 서브트리 user_id 합산.
    - 루징: 배팅정산 × 해당 행 파트너 유효 루징% / 100.
    - 보유머니·보유롤링: 행의 파트너 **본인** 스냅샷.
    - ``totals``: 첫 번째(전체) 행과 동일 — 하단 합계는 "선택 상위·기간 전체".
    - ``vertical``·기간은 KST 달력.
    """
    _assert_parent_visible(db, admin=admin, parent_id=parent_id, super_admin=super_admin)
    t0, t1 = kst_calendar_window_utc(date_from, date_to)
    gt = _game_types_for_vertical(vertical)

    stmt = select(User).where(User.referrer_id == parent_id).order_by(User.id)
    if not super_admin:
        allowed = downward_subtree_user_ids(db, admin.id)
        stmt = stmt.where(User.id.in_(allowed))
    elif site_id is not None:
        stmt = stmt.where(User.site_id == site_id)

    children: List[User] = list(db.scalars(stmt).all())
    leaf_ids = tuple(u.id for u in children)

    # 직속 하부 수 (drill 가능 여부)
    child_counts: Dict[int, int] = {}
    if leaf_ids:
        cc_stmt = (
            select(User.referrer_id, func.count())
            .where(User.referrer_id.in_(leaf_ids))
            .group_by(User.referrer_id)
        )
        child_counts = {int(r): int(c) for r, c in db.execute(cc_stmt).all()}

    parent = db.get(User, parent_id)
    rows_out: List[Dict[str, Any]] = []

    if parent is None:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="parent not found")

    # 1) 선택 상위 기준: 본인 + 전체 하부 (직추천 0명이어도 본인 실적 표시)
    full_ids = tuple(downward_subtree_user_ids(db, parent_id))
    full_row = _build_revenue_row(
        db,
        partner_user=parent,
        ids_sub=full_ids,
        t0=t0,
        t1=t1,
        gt=gt,
        has_children=len(children) > 0,
        row_scope="full_subtree",
    )
    rows_out.append(full_row)

    totals_dec = _row_to_totals_decimals(full_row)
    totals = {k: str(v.quantize(Q)) for k, v in totals_dec.items()}

    # 2) 직속 하부별 (하위 상위로 전환해 탐색)
    for u in children:
        subtree = downward_subtree_user_ids(db, u.id)
        ids_sub = tuple(subtree)
        row = _build_revenue_row(
            db,
            partner_user=u,
            ids_sub=ids_sub,
            t0=t0,
            t1=t1,
            gt=gt,
            has_children=(child_counts.get(u.id, 0) > 0),
            row_scope="direct_child",
        )
        rows_out.append(row)

    p = parent
    parent_info = {
        "id": parent_id,
        "login_id": p.login_id if p else "",
        "display_name": ((p.display_name or "").strip() or (p.login_id if p else "")),
    }

    ref_id = int(parent.referrer_id) if parent and parent.referrer_id is not None else None

    return {
        "parent": parent_info,
        "parent_referrer_id": ref_id,
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "timezone": "Asia/Seoul",
        "vertical": (vertical or "all").strip().lower(),
        "rows": rows_out,
        "totals": totals,
    }
