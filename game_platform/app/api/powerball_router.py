"""파워볼: 회차 동기화(폴링)·배팅·내역 (어드민 JWT)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.constants import USER_ROLE_SUPER_ADMIN
from app.core.config import settings
from app.core.database import get_db
from app.dependencies.auth_jwt import require_admin_user
from app.dependencies.data_scope import assert_viewer_may_access_target_user
from app.models.powerball import PowerballBet, PowerballRound
from app.models.site_config import SiteConfig
from app.models.user import User
from app.services.downline_subtree import downward_subtree_user_ids
from app.services.kst_time import optional_kst_calendar_window
from app.services.powerball_service import (
    VALID_PICKS,
    commit_poll_transaction_if_modified,
    configured_powerball_game_keys,
    get_next_round,
    list_pending_rounds_without_result,
    live_iframe_src,
    merged_powerball_odds_map,
    place_powerball_bet,
    poll_once,
    powerball_games_catalog,
    validate_pick_string,
)

router = APIRouter()


class PowerballBetPlaceBody(BaseModel):
    user_id: int
    pick: str = Field(..., description="단일 또는 조합 sum_odd|pb_even")
    amount: str = Field(..., description="게임머니 스테이크")
    game_key: str = Field(default="coinpowerball3", description="종목 키")


class PowerballOddsPatchBody(BaseModel):
    """픽 코드 → 배당 문자열(예 1.95). 조합 배팅 시 각 픽 배당을 곱합니다."""

    odds: dict[str, str] = Field(default_factory=dict)


def _round_dict(r: PowerballRound) -> dict[str, Any]:
    return {
        "game_key": r.game_key,
        "round_no": r.round_no,
        "num": r.num,
        "pb": r.pb,
        "sum": r.sum_val,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _bet_dict(b: PowerballBet, login_id: str) -> dict[str, Any]:
    return {
        "id": b.id,
        "user_id": b.user_id,
        "login_id": login_id,
        "game_key": b.game_key,
        "round_no": b.round_no,
        "pick": b.pick,
        "amount": str(b.amount),
        "odds": str(b.odds),
        "status": b.status,
        "payout": str(b.payout) if b.payout is not None else None,
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "settled_at": b.settled_at.isoformat() if b.settled_at else None,
    }


@router.get("/powerball/overview")
def powerball_overview(
    game_key: Optional[str] = Query(None, description="선택 종목(비우면 첫 종목)"),
    db: Session = Depends(get_db),
    viewer: User = Depends(require_admin_user),
) -> dict[str, Any]:
    keys = configured_powerball_game_keys()
    gk = (game_key or (keys[0] if keys else "coinpowerball3")).strip()
    if gk not in keys:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 game_key: {gk}")
    next_r = get_next_round(db, gk)
    recent = list(
        db.scalars(
            select(PowerballRound)
            .where(PowerballRound.game_key == gk)
            .order_by(desc(PowerballRound.round_no))
            .limit(30)
        ).all()
    )
    odds_map = merged_powerball_odds_map(db, viewer.site_id)
    odds_by_pick = {k: str(v) for k, v in sorted(odds_map.items())}
    return {
        "next_round": next_r,
        "min_bet": str(settings.POWERBALL_MIN_BET),
        "default_odds_env": settings.POWERBALL_ODDS,
        "odds_by_pick": odds_by_pick,
        "game_key": gk,
        "games": powerball_games_catalog(db),
        "live_iframe_url": live_iframe_src(gk),
        "recent_rounds": [_round_dict(x) for x in recent],
        "valid_picks": sorted(VALID_PICKS),
        "poll_mode": {
            "background_interval_sec": int(getattr(settings, "POWERBALL_POLL_INTERVAL_SEC", 0) or 0),
            "powerball_enabled": bool(settings.POWERBALL_ENABLED),
            "max_attempts_per_tick": int(
                getattr(settings, "POWERBALL_POLL_MAX_ATTEMPTS_PER_TICK", 12) or 12
            ),
        },
        "recovery": {
            "pending_without_round": list_pending_rounds_without_result(db),
            "note": "결과 행 없이 pending만 있는 회차. 상위 피드가 해당 회차를 다시 주면 poll 로 해소. 피드가 과거 회차를 안 주면 수동 처리 필요.",
        },
    }


@router.get("/powerball/odds")
def powerball_odds_get(
    db: Session = Depends(get_db),
    viewer: User = Depends(require_admin_user),
) -> dict[str, Any]:
    m = merged_powerball_odds_map(db, viewer.site_id)
    return {"odds": {k: str(v) for k, v in sorted(m.items())}}


@router.patch("/powerball/odds")
def powerball_odds_patch(
    body: PowerballOddsPatchBody,
    db: Session = Depends(get_db),
    viewer: User = Depends(require_admin_user),
) -> dict[str, Any]:
    site = db.get(SiteConfig, viewer.site_id)
    if site is None:
        raise HTTPException(status_code=404, detail="site not found")
    cur: dict[str, Any] = {}
    if isinstance(site.powerball_odds, dict):
        cur = {str(k): v for k, v in site.powerball_odds.items()}
    for k, v in body.odds.items():
        if k not in VALID_PICKS:
            continue
        try:
            d = Decimal(v)
        except Exception:
            raise HTTPException(status_code=400, detail=f"invalid odds for {k}")
        if d < Decimal("1") or d > Decimal("999"):
            raise HTTPException(status_code=400, detail=f"odds out of range for {k}")
        cur[k] = str(d.quantize(Decimal("0.0001")))
    site.powerball_odds = cur if cur else None
    db.commit()
    m = merged_powerball_odds_map(db, viewer.site_id)
    return {"ok": True, "odds": {k: str(v) for k, v in sorted(m.items())}}


@router.post("/powerball/poll")
def powerball_poll(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_user),
) -> dict[str, Any]:
    out = poll_once(db)
    committed = commit_poll_transaction_if_modified(db)
    if not out.get("ok") and not committed:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=out.get("error", "poll failed"),
        )
    out["committed"] = committed
    return out


@router.get("/powerball/bets")
def powerball_bets(
    db: Session = Depends(get_db),
    user: User = Depends(require_admin_user),
    limit: int = Query(80, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user_id: Optional[int] = Query(None),
    game_key: Optional[str] = Query(None, description="종목 키(예 coinpowerball3)"),
    login_id: Optional[str] = Query(None, description="회원 login_id 부분 검색"),
    date_from: Optional[date] = Query(None, description="KST 시작일(포함)"),
    date_to: Optional[date] = Query(None, description="KST 종료일(포함)"),
) -> dict[str, Any]:
    try:
        t0, t1 = optional_kst_calendar_window(date_from, date_to, default_span_days=6)
    except ValueError:
        raise HTTPException(status_code=400, detail="날짜 범위가 올바르지 않습니다. (KST)")
    q = (
        select(PowerballBet)
        .where(PowerballBet.created_at >= t0, PowerballBet.created_at < t1)
        .order_by(desc(PowerballBet.id))
    )
    allowed: Optional[set[int]] = None
    if user.role != USER_ROLE_SUPER_ADMIN:
        allowed = set(downward_subtree_user_ids(db, user.id))
        q = q.where(PowerballBet.user_id.in_(allowed))
    if user_id is not None:
        assert_viewer_may_access_target_user(db, user, user_id)
        q = q.where(PowerballBet.user_id == user_id)
    elif login_id and login_id.strip():
        q = q.join(User, PowerballBet.user_id == User.id).where(User.login_id.ilike(f"%{login_id.strip()}%"))
    if game_key and game_key.strip():
        q = q.where(PowerballBet.game_key == game_key.strip())
    rows = list(db.scalars(q.offset(offset).limit(limit)).all())
    uids = {b.user_id for b in rows}
    id_to_login: dict[int, str] = {}
    if uids:
        for u in db.scalars(select(User).where(User.id.in_(uids))).all():
            id_to_login[u.id] = u.login_id
    return {
        "items": [_bet_dict(b, id_to_login.get(b.user_id, "")) for b in rows],
        "offset": offset,
        "limit": limit,
    }


@router.post("/powerball/bets")
def powerball_place_bet(
    body: PowerballBetPlaceBody,
    db: Session = Depends(get_db),
    viewer: User = Depends(require_admin_user),
) -> dict[str, Any]:
    assert_viewer_may_access_target_user(db, viewer, body.user_id)
    try:
        amt = Decimal(body.amount)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid amount")
    res = place_powerball_bet(
        db, user_id=body.user_id, pick=body.pick, amount=amt, game_key=body.game_key
    )
    if not res.ok:
        raise HTTPException(status_code=400, detail=res.detail)
    db.commit()
    return {"ok": True, "bet_id": res.bet_id}


@router.get("/powerball/picks/validate")
def powerball_validate_pick(pick: str) -> dict[str, Any]:
    err = validate_pick_string(pick)
    return {"ok": err is None, "error": err}
