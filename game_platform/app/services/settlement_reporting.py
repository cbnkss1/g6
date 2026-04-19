"""파트너 롤링: 기간·종목별 지급을 수령인별 합산 (원장은 건별 유지, 조회만 집계)."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Collection, Dict, List, Optional
from uuid import UUID

from sqlalchemy import Integer, cast, func, select
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


def _rolling_base_join(
    Player: Any,
    Referrer: Any,
) -> Any:
    return (
        select(
            Referrer.id.label("recv_id"),
            Referrer.login_id.label("recv_login"),
            func.coalesce(func.sum(RollingPointLedgerEntry.delta), 0).label("sum_delta"),
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

    stmt = _rolling_base_join(Player, Referrer)
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
    sum_roll = Decimal("0")
    for recv_id, recv_login, sum_delta, ledger_count in rows:
        sd = Decimal(str(sum_delta or 0)).quantize(Decimal("0.000001"))
        sum_roll += sd
        recipient_totals.append(
            {
                "user_id": int(recv_id),
                "login_id": recv_login,
                "rolling_paid_sum": str(sd),
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
            "rolling_paid_sum": str(sum_roll.quantize(Decimal("0.000001"))),
        },
    }


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
) -> Dict[str, Any]:
    """수령인·기간·종목별 롤링 원장 건별 목록 (배팅 조인)."""
    t0, t1 = kst_calendar_window_utc(date_from, date_to)
    Player = aliased(User)
    Referrer = aliased(User)

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
            RollingPointLedgerEntry.reason.in_(_ROLLING_REASONS),
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
        "items": items,
    }
