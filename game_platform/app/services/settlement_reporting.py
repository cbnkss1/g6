"""파트너 롤링: 기간·종목별 지급을 수령인별 합산 (원장은 건별 유지, 조회만 집계)."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Collection, Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy import Integer, and_, cast, case, func, select
from sqlalchemy.orm import Session, aliased

from app.models.bet import BetHistory
from app.models.enums import RollingPointLedgerReason
from app.models.ledger import RollingPointLedgerEntry
from app.models.user import User
from app.services.kst_time import KST, kst_calendar_window_utc, kst_today_date
from app.services.total_revenue_service import _game_types_for_vertical

_ROLLING_REASONS = (
    RollingPointLedgerReason.REFERRAL_ROLLING.value,
    RollingPointLedgerReason.SELF_ROLLING.value,
    RollingPointLedgerReason.DIFFERENTIAL_ROLLING.value,
    RollingPointLedgerReason.DIFFERENTIAL_LOSING.value,
)


def _rolling_base_select_aggregated(Player: Any, Referrer: Any) -> Any:
    """수령인별: 차액 롤링·본인·차액 루징을 분리 합산(상부는 차액 롤링만이 ‘실제 체인 몫’)."""
    dr = RollingPointLedgerReason.DIFFERENTIAL_ROLLING.value
    sr = RollingPointLedgerReason.SELF_ROLLING.value
    lr = RollingPointLedgerReason.DIFFERENTIAL_LOSING.value
    rr = RollingPointLedgerReason.REFERRAL_ROLLING.value
    # 차액 루징: 배터=수령인(본인 배팅에서 생긴 루징) vs 하부 배팅에서 상부로 지급된 루징
    losing_self_case = and_(RollingPointLedgerEntry.reason == lr, Player.id == Referrer.id)
    losing_down_case = and_(RollingPointLedgerEntry.reason == lr, Player.id != Referrer.id)
    return (
        select(
            Referrer.id.label("recv_id"),
            Referrer.login_id.label("recv_login"),
            func.coalesce(
                func.sum(
                    case((RollingPointLedgerEntry.reason == dr, RollingPointLedgerEntry.delta), else_=0)
                ),
                0,
            ).label("sum_diff_roll"),
            func.coalesce(
                func.sum(
                    case((RollingPointLedgerEntry.reason == sr, RollingPointLedgerEntry.delta), else_=0)
                ),
                0,
            ).label("sum_self_roll"),
            func.coalesce(
                func.sum(case((losing_self_case, RollingPointLedgerEntry.delta), else_=0)),
                0,
            ).label("sum_losing_self"),
            func.coalesce(
                func.sum(case((losing_down_case, RollingPointLedgerEntry.delta), else_=0)),
                0,
            ).label("sum_losing_downline"),
            func.coalesce(
                func.sum(
                    case((RollingPointLedgerEntry.reason == rr, RollingPointLedgerEntry.delta), else_=0)
                ),
                0,
            ).label("sum_referral_roll"),
            func.count(RollingPointLedgerEntry.id).label("ledger_count"),
        )
        .select_from(RollingPointLedgerEntry)
        .join(
            BetHistory,
            BetHistory.id == cast(RollingPointLedgerEntry.reference_id, Integer),
        )
        .join(Player, Player.id == BetHistory.user_id)
        .join(Referrer, Referrer.id == RollingPointLedgerEntry.user_id)
        .where(
            RollingPointLedgerEntry.reason.in_(_ROLLING_REASONS),
            RollingPointLedgerEntry.reference_type == "BET",
            RollingPointLedgerEntry.reference_id.isnot(None),
            RollingPointLedgerEntry.reference_id.op("~")("^[0-9]+$"),
        )
    )


def _apply_rolling_scope(
    stmt: Any,
    *,
    site_id: Optional[UUID],
    super_admin: bool,
    scope_subtree_user_ids: Optional[Collection[int]],
    Player: Any,
    Referrer: Any,
) -> Any:
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
    return stmt


def get_rolling_settlement_lines(
    db: Session,
    *,
    site_id: Optional[UUID],
    super_admin: bool,
    scope_subtree_user_ids: Optional[Collection[int]] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    vertical: Optional[str] = None,
) -> Dict[str, Any]:
    """
    롤링포인트 지급을 **수령인(ledger user_id)별로 합산**해 반환.
    기간: KST 달력 date_from~date_to (양끝 포함). 미지정 시 **오늘 하루**.
    ``vertical``: ``casino`` | ``slot`` | ``powerball`` | ``sports`` 이면 해당 배팅 종목만.
    """
    d0 = date_from or kst_today_date()
    d1 = date_to or kst_today_date()
    t0, t1 = kst_calendar_window_utc(d0, d1)

    Player = aliased(User)
    Referrer = aliased(User)

    stmt = _rolling_base_select_aggregated(Player, Referrer)
    stmt = stmt.where(
        RollingPointLedgerEntry.created_at >= t0,
        RollingPointLedgerEntry.created_at < t1,
    )
    gt = _game_types_for_vertical(vertical)
    if gt:
        stmt = stmt.where(BetHistory.game_type.in_(gt))

    stmt = _apply_rolling_scope(
        stmt,
        site_id=site_id,
        super_admin=super_admin,
        scope_subtree_user_ids=scope_subtree_user_ids,
        Player=Player,
        Referrer=Referrer,
    )
    stmt = stmt.group_by(Referrer.id, Referrer.login_id).order_by(Referrer.login_id)

    rows = db.execute(stmt).all()
    recipient_totals: List[Dict[str, Any]] = []
    sum_diff = Decimal("0")
    sum_self = Decimal("0")
    sum_lose_self = Decimal("0")
    sum_lose_down = Decimal("0")
    sum_ref = Decimal("0")
    for (
        recv_id,
        recv_login,
        sum_diff_roll,
        sum_self_roll,
        sum_losing_self,
        sum_losing_downline,
        sum_referral_roll,
        ledger_count,
    ) in rows:
        d_diff = Decimal(str(sum_diff_roll or 0)).quantize(Decimal("0.000001"))
        d_self = Decimal(str(sum_self_roll or 0)).quantize(Decimal("0.000001"))
        d_ls = Decimal(str(sum_losing_self or 0)).quantize(Decimal("0.000001"))
        d_ld = Decimal(str(sum_losing_downline or 0)).quantize(Decimal("0.000001"))
        d_ref = Decimal(str(sum_referral_roll or 0)).quantize(Decimal("0.000001"))
        recv_total = (d_diff + d_self + d_ls + d_ld + d_ref).quantize(Decimal("0.000001"))
        sum_diff += d_diff
        sum_self += d_self
        sum_lose_self += d_ls
        sum_lose_down += d_ld
        sum_ref += d_ref
        recipient_totals.append(
            {
                "user_id": int(recv_id),
                "login_id": recv_login,
                # 수령인이 이 기간·종목에서 실제로 받은 롤링P 합(차액+본인+루징+추천) — 리프는 차액만 0이어도 여기에 본인 롤이 잡힘
                "rolling_recv_total": str(recv_total),
                # 메인 숫자: 추천 체인 **차액 롤링**만 (하부 몫 제외한 상부 실수령 몫에 해당)
                "rolling_paid_sum": str(d_diff),
                "rolling_self_sum": str(d_self),
                "rolling_diff_losing_self_sum": str(d_ls),
                "rolling_diff_losing_downline_sum": str(d_ld),
                "rolling_referral_sum": str(d_ref),
                "ledger_count": int(ledger_count or 0),
            }
        )

    v = (vertical or "all").strip().lower()
    return {
        "day_start_utc": t0.isoformat(),
        "day_start_kst": t0.astimezone(KST).isoformat(),
        "period_end_utc": t1.isoformat(),
        "period_end_kst": t1.astimezone(KST).isoformat(),
        "date_from": d0.isoformat(),
        "date_to": d1.isoformat(),
        "vertical": v,
        "timezone": "Asia/Seoul",
        "recipient_totals": recipient_totals,
        "lines": [],
        "totals": {
            "total_bet_sum": "0",
            "valid_bet_sum": "0",
            "rolling_recv_total": str(
                (sum_diff + sum_self + sum_lose_self + sum_lose_down + sum_ref).quantize(
                    Decimal("0.000001")
                )
            ),
            "rolling_paid_sum": str(sum_diff.quantize(Decimal("0.000001"))),
            "rolling_self_sum": str(sum_self.quantize(Decimal("0.000001"))),
            "rolling_diff_losing_self_sum": str(sum_lose_self.quantize(Decimal("0.000001"))),
            "rolling_diff_losing_downline_sum": str(sum_lose_down.quantize(Decimal("0.000001"))),
            "rolling_referral_sum": str(sum_ref.quantize(Decimal("0.000001"))),
        },
    }


def _reasons_for_detail_scope(scope: str) -> Tuple[str, ...]:
    s = (scope or "chain").strip().lower()
    if s == "chain":
        return (RollingPointLedgerReason.DIFFERENTIAL_ROLLING.value,)
    if s == "self":
        return (RollingPointLedgerReason.SELF_ROLLING.value,)
    # 차액 루징: losing=하부 배팅 기준, losing_self=배터==수령인(본인 루징) — reason 동일, 건별 필터로 구분
    if s in ("losing", "losing_self"):
        return (RollingPointLedgerReason.DIFFERENTIAL_LOSING.value,)
    if s == "referral":
        return (RollingPointLedgerReason.REFERRAL_ROLLING.value,)
    return _ROLLING_REASONS


def get_rolling_ledger_detail_lines(
    db: Session,
    *,
    site_id: Optional[UUID],
    super_admin: bool,
    scope_subtree_user_ids: Optional[Collection[int]],
    recipient_user_id: int,
    date_from: date,
    date_to: date,
    vertical: Optional[str] = None,
    detail_scope: str = "chain",
) -> Dict[str, Any]:
    """수령인·기간·종목별 롤링 원장 건별 목록 (배팅 조인). ``detail_scope``: chain=차액롤링만(기본)."""
    t0, t1 = kst_calendar_window_utc(date_from, date_to)
    Player = aliased(User)
    Referrer = aliased(User)
    reason_filter = _reasons_for_detail_scope(detail_scope)

    stmt = (
        select(
            RollingPointLedgerEntry.id,
            RollingPointLedgerEntry.created_at,
            RollingPointLedgerEntry.delta,
            RollingPointLedgerEntry.reason,
            BetHistory.id.label("bet_id"),
            BetHistory.game_type,
            BetHistory.bet_amount,
            BetHistory.external_bet_uid,
            Player.login_id.label("bettor_login"),
            Referrer.login_id.label("recipient_login"),
        )
        .select_from(RollingPointLedgerEntry)
        .join(
            BetHistory,
            BetHistory.id == cast(RollingPointLedgerEntry.reference_id, Integer),
        )
        .join(Player, Player.id == BetHistory.user_id)
        .join(Referrer, Referrer.id == RollingPointLedgerEntry.user_id)
        .where(
            Referrer.id == recipient_user_id,
            RollingPointLedgerEntry.reason.in_(reason_filter),
            RollingPointLedgerEntry.reference_type == "BET",
            RollingPointLedgerEntry.reference_id.isnot(None),
            RollingPointLedgerEntry.reference_id.op("~")("^[0-9]+$"),
            RollingPointLedgerEntry.created_at >= t0,
            RollingPointLedgerEntry.created_at < t1,
        )
    )
    gt = _game_types_for_vertical(vertical)
    if gt:
        stmt = stmt.where(BetHistory.game_type.in_(gt))

    stmt = _apply_rolling_scope(
        stmt,
        site_id=site_id,
        super_admin=super_admin,
        scope_subtree_user_ids=scope_subtree_user_ids,
        Player=Player,
        Referrer=Referrer,
    )
    ds = (detail_scope or "chain").strip().lower()
    if ds == "losing":
        stmt = stmt.where(Player.id != Referrer.id)
    elif ds == "losing_self":
        stmt = stmt.where(Player.id == Referrer.id)
    stmt = stmt.order_by(RollingPointLedgerEntry.created_at.desc(), RollingPointLedgerEntry.id.desc())

    rows = db.execute(stmt).all()
    items: List[Dict[str, Any]] = []
    for (
        lid,
        created_at,
        delta,
        reason,
        bet_id,
        game_type,
        bet_amount,
        ext_uid,
        bettor_login,
        recipient_login,
    ) in rows:
        d = Decimal(str(delta or 0)).quantize(Decimal("0.000001"))
        items.append(
            {
                "ledger_id": int(lid),
                "created_at": created_at.isoformat() if created_at else None,
                "delta": str(d),
                "reason": reason,
                "bet_id": int(bet_id),
                "game_type": game_type,
                "bet_amount": str(Decimal(str(bet_amount or 0)).quantize(Decimal("0.000001"))),
                "external_bet_uid": ext_uid,
                "bettor_login": bettor_login,
                "recipient_login": recipient_login,
            }
        )

    recv_login = items[0]["recipient_login"] if items else None
    if recv_login is None:
        r0 = db.execute(select(User.login_id).where(User.id == recipient_user_id)).scalar_one_or_none()
        recv_login = r0

    v = (vertical or "all").strip().lower()
    return {
        "recipient_user_id": recipient_user_id,
        "recipient_login_id": recv_login,
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "vertical": v,
        "detail_scope": (detail_scope or "chain").strip().lower(),
        "items": items,
    }
