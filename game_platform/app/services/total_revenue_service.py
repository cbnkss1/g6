"""
전체 수익 현황: 직속 하부(추천 1단)별 기간 집계 — 카지노/슬롯 구분 없이 합산.
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
    `parent_id` 직속 하부만 행으로 반환 (클릭 시 parent_id만 바꿔 재호출).
    - 입출금·배팅·롤링·유저별 롤링: 해당 행 회원을 루트로 한 **전체 하부 서브트리** 합산.
    - 루징: 통 바구니 — **배팅정산 × 해당 행 파트너 본인의 유효 루징% / 100** (기간·종목 스테이크 가중).
    - 보유머니·보유롤링: 행 회원 **본인** 스냅샷.
    - 배팅정산 = 배팅손익 − 롤링(롤링 포인트 열, 트리 합산).
    - ``vertical``: ``casino`` | ``slot`` | ``powerball`` | ``sports`` 이면 해당 구간만 (미지정 시 전 종목).
    - 기간 ``date_from`` ~ ``date_to`` 는 **KST 달력 날짜** (자정~자정, Asia/Seoul).
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
    z = Decimal("0").quantize(Q)

    totals = {
        "deposit_sum": z,
        "withdraw_sum": z,
        "cash_net": z,
        "bet_amount": z,
        "win_amount": z,
        "bet_profit_loss": z,
        "rolling_total": z,
        "rolling_from_members": z,
        "rolling_self": z,
        "rolling_points": z,
        "losing": z,
        "bet_settlement": z,
    }

    for u in children:
        subtree = downward_subtree_user_ids(db, u.id)
        ids_sub = tuple(subtree)

        d = _sum_cash_total(db, ids_sub, t0, t1, "DEPOSIT")
        w = _sum_cash_total(db, ids_sub, t0, t1, "WITHDRAW")
        net = (d - w).quantize(Q)
        st, wi = _sum_bets_total(db, ids_sub, t0, t1, gt)
        bpl = (st - wi).quantize(Q)
        r_all = _sum_rolling_delta(db, ids_sub, t0, t1, ROLL_REASONS_ALL, gt)
        r_mem = _sum_rolling_delta(db, ids_sub, t0, t1, ROLL_FROM_MEMBERS, gt)
        r_self = _sum_rolling_delta(db, ids_sub, t0, t1, ROLL_SELF_ONLY, gt)
        r_only = _sum_rolling_delta(db, ids_sub, t0, t1, ROLL_REASONS_ROLLING_ONLY, gt)
        # 배팅정산 = 배팅손익 − 롤링(포인트, 트리 합산)
        bet_settle = (bpl - r_only).quantize(Q)
        eff_l = _effective_losing_percent_partner_period(db, u.id, ids_sub, t0, t1, gt)
        ls = (bet_settle * eff_l / Decimal("100")).quantize(Q)

        row = {
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
            "rolling_total": str(r_all),
            "rolling_from_members": str(r_mem),
            "rolling_self": str(r_self),
            "rolling_points": str(r_only),
            "losing": str(ls),
            "losing_rate_percent": str(eff_l),
            "bet_settlement": str(bet_settle),
            "has_children": (child_counts.get(u.id, 0) > 0),
        }
        rows_out.append(row)

        totals["deposit_sum"] += d
        totals["withdraw_sum"] += w
        totals["cash_net"] += net
        totals["bet_amount"] += st
        totals["win_amount"] += wi
        totals["bet_profit_loss"] += bpl
        totals["rolling_total"] += r_all
        totals["rolling_from_members"] += r_mem
        totals["rolling_self"] += r_self
        totals["rolling_points"] += r_only
        totals["losing"] += ls
        totals["bet_settlement"] += bet_settle

    for k in totals:
        totals[k] = str(totals[k].quantize(Q))

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
