"""
내부 API: 데모 시드, 배팅 생성, 정산 + WebSocket 브로드캐스트.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.constants import DEFAULT_SITE_ID
from app.core.config import settings
from app.services.powerball_service import probe_upstream as powerball_probe_upstream
from app.services.toto_api_service import game_apis_status_summary, probe_toto_api
from app.core.database import SessionLocal, get_db
from app.models.bet import BetHistory
from app.models.site_config import SiteConfig
from app.models.enums import GameResult
from app.models.user import User, UserGameRollingRate
from app.schemas.admin import PlaceBetRequestBody, SettlementRequestBody
from app.services.bet_placement_service import BetPlacementService
from app.services.dashboard_stats import get_today_totals
from app.services.powerball_service import (
    commit_poll_transaction_if_modified,
    poll_once as powerball_poll_once,
)
from app.services.settlement_service import SettlementResult, SettlementService
from app.websockets.manager import admin_ws_manager

router = APIRouter()


def require_internal_key(x_internal_key: Optional[str] = Header(None)) -> None:
    expected = (settings.INTERNAL_API_KEY or "").strip()
    if not expected or (x_internal_key or "").strip() != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid internal key")


async def _broadcast_new_bet(bet_id: int) -> None:
    with SessionLocal() as db:
        bet = db.get(BetHistory, bet_id)
        if bet is None:
            return
        u = db.get(User, bet.user_id)
        login_id = u.login_id if u else ""
        payload: Dict[str, Any] = {
            "bet_id": bet.id,
            "external_bet_uid": bet.external_bet_uid,
            "login_id": login_id,
            "game_type": bet.game_type,
            "bet_amount": str(bet.bet_amount),
            "win_amount": str(bet.win_amount) if bet.win_amount is not None else None,
            "status": bet.status,
            "game_result": bet.game_result or "",
        }
        if bet.created_at:
            payload["created_at"] = bet.created_at.isoformat()
    await admin_ws_manager.broadcast_event("bet_log", payload)


async def _broadcast_settlement(result: SettlementResult) -> None:
    payload = SettlementService.event_payload(result)
    with SessionLocal() as db:
        if result.ok and result.bet_id:
            bet = db.get(BetHistory, result.bet_id)
            if bet:
                payload.update(
                    {
                        "external_bet_uid": bet.external_bet_uid,
                        "game_type": bet.game_type,
                        "game_result": bet.game_result or "",
                        "bet_amount": str(bet.bet_amount),
                        "user_id": bet.user_id,
                    }
                )
        payload.update(get_today_totals(db))
        payload["admin_ws_connections"] = admin_ws_manager.connection_count()
    await admin_ws_manager.broadcast_event("settlement", payload)


@router.post("/bootstrap-demo", dependencies=[Depends(require_internal_key)])
def internal_bootstrap_demo(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """데모 유저·롤링율·잔액이 없을 때만 생성."""
    n = db.scalar(select(func.count()).select_from(User)) or 0
    if n > 0:
        return {"ok": True, "skipped": True, "existing_users": int(n)}

    if db.get(SiteConfig, DEFAULT_SITE_ID) is None:
        db.add(
            SiteConfig(
                site_id=DEFAULT_SITE_ID,
                site_name="Demo Site",
                is_casino_enabled=True,
                is_powerball_enabled=True,
                is_toto_enabled=True,
            )
        )
        db.flush()

    master = User(
        login_id="demo_master",
        display_name="데모 총본",
        site_id=DEFAULT_SITE_ID,
        role="owner",
        referrer_id=None,
        game_money_balance=Decimal("50000000"),
        rolling_point_balance=Decimal("0"),
    )
    db.add(master)
    db.flush()

    agent = User(
        login_id="demo_agent",
        display_name="데모 총판",
        site_id=DEFAULT_SITE_ID,
        role="owner",
        is_store_enabled=True,
        referrer_id=master.id,
        game_money_balance=Decimal("20000000"),
        rolling_point_balance=Decimal("0"),
    )
    db.add(agent)
    db.flush()

    players: List[User] = []
    for i in range(1, 6):
        p = User(
            login_id=f"demo_player_{i}",
            display_name=f"데모 플레이어 {i}",
            site_id=DEFAULT_SITE_ID,
            role="owner",
            referrer_id=agent.id,
            game_money_balance=Decimal("5000000"),
            rolling_point_balance=Decimal("0"),
        )
        db.add(p)
        players.append(p)
    db.flush()

    for p in players:
        db.add(
            UserGameRollingRate(
                user_id=p.id,
                game_type="BACCARAT",
                rolling_rate_percent=Decimal("1.25"),
                losing_rate_percent=Decimal("0"),
            )
        )
        db.add(
            UserGameRollingRate(
                user_id=p.id,
                game_type="SLOT",
                rolling_rate_percent=Decimal("0.80"),
                losing_rate_percent=Decimal("0"),
            )
        )
        db.add(
            UserGameRollingRate(
                user_id=p.id,
                game_type="POWERBALL",
                rolling_rate_percent=Decimal("0.50"),
                losing_rate_percent=Decimal("0"),
            )
        )

    db.commit()
    return {
        "ok": True,
        "skipped": False,
        "user_ids": [p.id for p in players],
        "agent_id": agent.id,
        "master_id": master.id,
    }


@router.get("/players", dependencies=[Depends(require_internal_key)])
def internal_list_players(db: Session = Depends(get_db)) -> Dict[str, Any]:
    rows = db.scalars(select(User).order_by(User.id)).all()
    return {
        "players": [
            {"id": u.id, "login_id": u.login_id, "referrer_id": u.referrer_id}
            for u in rows
        ]
    }


@router.post("/place-bet", dependencies=[Depends(require_internal_key)])
def internal_place_bet(
    body: PlaceBetRequestBody,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    res = BetPlacementService.place_pending_bet(
        db,
        user_id=body.user_id,
        external_bet_uid=body.external_bet_uid.strip()[:64],
        game_type=body.game_type.strip().upper()[:32],
        stake=Decimal(body.stake),
    )
    if not res.ok:
        raise HTTPException(status_code=400, detail=res.detail)
    db.commit()
    if res.bet_id:
        background_tasks.add_task(_broadcast_new_bet, res.bet_id)
    return {"ok": True, "bet_id": res.bet_id, "external_bet_uid": body.external_bet_uid}


@router.post("/settle", dependencies=[Depends(require_internal_key)])
async def internal_settle(
    body: SettlementRequestBody,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    try:
        gr = GameResult.parse(body.game_result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None

    try:
        result = SettlementService.settle_from_game_api(
            db,
            external_bet_uid=body.external_bet_uid,
            game_result=gr,
            win_amount=Decimal(body.win_amount),
        )
        db.commit()
    except Exception:
        db.rollback()
        raise

    if result.ok and not result.already_settled:
        background_tasks.add_task(_broadcast_settlement, result)

    out = SettlementService.event_payload(result)
    if result.bet_id:
        with SessionLocal() as s2:
            bet = s2.get(BetHistory, result.bet_id)
            if bet:
                out.update(
                    {
                        "game_type": bet.game_type,
                        "game_result": bet.game_result or "",
                        "bet_amount": str(bet.bet_amount),
                        "total_bet": str(bet.bet_amount),
                    }
                )
            out.update(get_today_totals(s2))
    return {"result": out}


@router.get("/game-apis/status", dependencies=[Depends(require_internal_key)])
def internal_game_apis_status() -> Dict[str, Any]:
    """파워볼·토토 외부 연동 설정 요약(호스트·플래그만, 비밀 미포함)."""
    return game_apis_status_summary()


@router.get("/powerball/probe", dependencies=[Depends(require_internal_key)])
def internal_powerball_probe() -> Dict[str, Any]:
    """외부 파워볼 URL·Bearer·게임 키만 검증 (DB 미변경)."""
    return powerball_probe_upstream()


@router.get("/toto/probe", dependencies=[Depends(require_internal_key)])
def internal_toto_probe() -> Dict[str, Any]:
    """토토 베이스 URL + probe 경로 GET (동기화 로직 전 연결 확인)."""
    return probe_toto_api()


@router.post("/powerball/poll", dependencies=[Depends(require_internal_key)])
def internal_powerball_poll(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """cron/systemd에서 주기 호출: API 1회 수집·정산."""
    out = powerball_poll_once(db)
    committed = commit_poll_transaction_if_modified(db)
    if not out.get("ok") and not committed:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=out.get("error", "poll failed"))
    out["committed"] = committed
    return out


@router.post("/broadcast-dashboard", dependencies=[Depends(require_internal_key)])
async def internal_broadcast_dashboard_tick() -> Dict[str, str]:
    """시뮬레이터 없이 집계만 푸시할 때."""
    with SessionLocal() as db:
        payload = get_today_totals(db)
        payload["admin_ws_connections"] = admin_ws_manager.connection_count()
    await admin_ws_manager.broadcast_event("dashboard_tick", payload)
    return {"status": "sent"}
