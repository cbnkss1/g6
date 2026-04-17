"""
스포츠 토토 관리 API.

트랙 A  POST /admin/sports/matches/{id}/settle        개별 경기 수동 정산
트랙 B  POST /admin/sports/bulk-settle                한방 전체 정산
        GET  /admin/sports/matches                     경기 목록 (필터)
        POST /admin/sports/matches                     경기 등록
        POST /admin/sports/matches/sync-from-odds-api  The Odds API → DB 경기·배당 반영
        PATCH /admin/sports/matches/{id}/status        상태 변경 (OPEN→CLOSED)
        GET  /admin/sports/matches/{id}/bets           해당 경기 배팅 현황
        GET  /admin/sports/pending-summary             한방 정산 대기 요약
        POST /admin/sports/bets                        배팅 등록 (내부/테스트용)
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.constants import USER_ROLE_SUPER_ADMIN
from app.core.config import settings
from app.core.database import get_db
from app.dependencies.auth_jwt import require_admin_user
from app.dependencies.data_scope import downward_subtree_user_ids_for_scope
from app.models.sports import SportsBet, SportsMatch, SportsOdds, SportsSlip, SportsTx
from app.models.user import User, UserGameRollingRate
from app.services.audit_service import AuditService
from app.services.sports_bet_history_bridge import create_bet_history_for_sports_bet
from app.services.sports_betting_time import match_kickoff_has_passed
from app.services.sports_settlement import bulk_settle_pending, settle_match
from app.services.sports_odds_import_service import sync_matches_from_odds_feed
from app.services.the_odds_api_service import fetch_odds_feed_fresh, get_cached_odds_feed
from app.websockets.manager import admin_ws_manager

router = APIRouter()


# ─── Pydantic bodies ─────────────────────────────────────────────────────────

class MatchCreateBody(BaseModel):
    external_match_id: str
    sport_type: str = "SOCCER"
    league_name: Optional[str] = None
    home_team: str
    away_team: str
    match_at: str  # ISO8601
    odds: Optional[List[Dict[str, Any]]] = None  # [{outcome, odds_value}, …]


class MatchStatusBody(BaseModel):
    status: str  # OPEN / CLOSED / CANCELLED


class MatchSettleBody(BaseModel):
    result: str  # HOME_WIN / DRAW / AWAY_WIN / CANCELLED / POSTPONED
    home_score: Optional[int] = None
    away_score: Optional[int] = None


class BetCreateBody(BaseModel):
    user_id: int
    slips: List[Dict[str, Any]]  # [{match_id, selected_outcome, odds_at_bet}, …]
    stake: str


# ─── 헬퍼 ────────────────────────────────────────────────────────────────────

def _match_dict(m: SportsMatch) -> Dict[str, Any]:
    return {
        "id": m.id,
        "external_match_id": m.external_match_id,
        "sport_type": m.sport_type,
        "league_name": m.league_name,
        "home_team": m.home_team,
        "away_team": m.away_team,
        "match_at": m.match_at.isoformat() if m.match_at else None,
        "status": m.status,
        "result": m.result,
        "home_score": m.home_score,
        "away_score": m.away_score,
        "settled_at": m.settled_at.isoformat() if m.settled_at else None,
        "odds": [
            {"outcome": o.outcome, "odds_value": str(o.odds_value)}
            for o in (m.odds or [])
        ],
    }


def _bet_dict(b: SportsBet) -> Dict[str, Any]:
    return {
        "id": b.id,
        "user_id": b.user_id,
        "stake": str(b.stake),
        "combined_odds": str(b.combined_odds),
        "potential_win": str(b.potential_win),
        "status": b.status,
        "win_amount": str(b.win_amount) if b.win_amount is not None else None,
        "settled_at": b.settled_at.isoformat() if b.settled_at else None,
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "slips": [
            {
                "id": s.id,
                "match_id": s.match_id,
                "selected_outcome": s.selected_outcome,
                "odds_at_bet": str(s.odds_at_bet),
                "result": s.result,
            }
            for s in (b.slips or [])
        ],
    }


def _get_scope_ids(db: Session, user: User) -> Optional[List[int]]:
    if user.role == USER_ROLE_SUPER_ADMIN:
        return None
    return downward_subtree_user_ids_for_scope(db, user.id)


# ─── The Odds API (외부 라이브 배당, TTL 캐시) ───────────────────────────────

@router.get("/sports/odds-api/feed", summary="The Odds API 라이브 배당 h2h·spreads·totals (캐시)")
def odds_api_feed(_user=Depends(require_admin_user)) -> Dict[str, Any]:
    """
    주요 리그 다종목(축구·농구·야구·아이스하키·NFL 등) — regions·markets 고정으로 크레딧 절약.
    `GAME_PLATFORM_THE_ODDS_API_KEY` 필수.
    """
    if not (settings.THE_ODDS_API_KEY or "").strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GAME_PLATFORM_THE_ODDS_API_KEY 가 설정되지 않았습니다.",
        )
    try:
        return get_cached_odds_feed()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e)[:500],
        ) from e


@router.post("/sports/matches/sync-from-odds-api", summary="The Odds API → 경기·배당 DB 반영")
def sync_matches_from_odds(
    force_refresh: bool = Query(
        False,
        description="True면 캐시 무시하고 외부 API 재호출(월 쿼터 소모). False면 TTL 캐시가 있으면 그걸로 동기화",
    ),
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    """
    The Odds API 피드(설정된 모든 스포츠 키)를 `gp_sports_matches` / `gp_sports_odds`에 upsert.
    배팅이 붙은 OPEN 경기·비-OPEN 경기는 스킵.
    """
    if not (settings.THE_ODDS_API_KEY or "").strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GAME_PLATFORM_THE_ODDS_API_KEY 가 설정되지 않았습니다.",
        )
    try:
        feed = fetch_odds_feed_fresh() if force_refresh else get_cached_odds_feed()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e)[:500],
        ) from e

    report = sync_matches_from_odds_feed(db, feed, actor=user)
    AuditService.log(
        db,
        actor=user,
        action="SPORTS_ODDS_SYNC",
        target_type="SPORTS",
        target_id="bulk",
        after=report,
        actor_ip=request.client.host if request else None,
    )
    db.commit()
    return report


# ─── 경기 목록 ────────────────────────────────────────────────────────────────

@router.get("/sports/matches", summary="경기 목록")
def list_matches(
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    match_status: Optional[str] = Query(None, alias="status"),
    sport_type: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    stmt = select(SportsMatch)
    if match_status:
        stmt = stmt.where(SportsMatch.status == match_status.upper())
    if sport_type:
        stmt = stmt.where(SportsMatch.sport_type == sport_type.upper())
    stmt = stmt.order_by(SportsMatch.match_at.desc()).offset(offset).limit(limit)
    rows = db.scalars(stmt).all()
    return {"items": [_match_dict(m) for m in rows], "limit": limit, "offset": offset}


@router.post("/sports/matches", summary="경기 등록")
def create_match(
    body: MatchCreateBody,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    match_at = datetime.fromisoformat(body.match_at.replace("Z", "+00:00"))
    m = SportsMatch(
        external_match_id=body.external_match_id,
        sport_type=body.sport_type.upper(),
        league_name=body.league_name,
        home_team=body.home_team,
        away_team=body.away_team,
        match_at=match_at,
        status="OPEN",
    )
    db.add(m)
    db.flush()
    if body.odds:
        for o in body.odds:
            db.add(SportsOdds(
                match_id=m.id,
                outcome=o["outcome"].upper(),
                odds_value=Decimal(str(o["odds_value"])),
            ))
    AuditService.log(db, actor=user, action="MATCH_CREATE",
                     target_type="MATCH", target_id=str(m.id),
                     after={"home": body.home_team, "away": body.away_team},
                     actor_ip=request.client.host if request else None)
    db.commit()
    db.refresh(m)
    return _match_dict(m)


@router.patch("/sports/matches/{match_id}/status", summary="경기 상태 변경")
def update_match_status(
    match_id: int,
    body: MatchStatusBody,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    m = db.get(SportsMatch, match_id)
    if m is None:
        raise HTTPException(status_code=404, detail="경기 없음")
    old = m.status
    m.status = body.status.upper()
    AuditService.log(db, actor=user, action="MATCH_STATUS_CHANGE",
                     target_type="MATCH", target_id=str(match_id),
                     before={"status": old}, after={"status": m.status},
                     actor_ip=request.client.host if request else None)
    db.commit()
    db.refresh(m)
    return _match_dict(m)


# ─── 트랙 A: 개별 경기 정산 ──────────────────────────────────────────────────

@router.post("/sports/matches/{match_id}/settle", summary="[트랙A] 개별 경기 수동 정산")
async def settle_single_match(
    match_id: int,
    body: MatchSettleBody,
    background: BackgroundTasks,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    try:
        report = settle_match(
            db,
            match_id=match_id,
            match_result=body.result,
            actor=user,
            actor_ip=request.client.host if request else None,
            home_score=body.home_score,
            away_score=body.away_score,
        )
        db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    # WS 브로드캐스트
    background.add_task(
        admin_ws_manager.broadcast_event,
        "settlement",
        {
            "type": "match_settled",
            "match_id": match_id,
            "result": body.result,
            "bets_processed": report.bets_processed,
            "total_payout": str(report.total_payout),
        },
    )
    return {
        "ok": True,
        "match_id": report.match_id,
        "match_result": report.match_result,
        "bets_processed": report.bets_processed,
        "bets_won": report.bets_won,
        "bets_lost": report.bets_lost,
        "bets_voided": report.bets_voided,
        "bets_skipped": report.bets_skipped,
        "total_payout": str(report.total_payout),
        "total_rolling": str(report.total_rolling),
        "errors": report.errors,
    }


# ─── 트랙 B: 한방 일괄 정산 ──────────────────────────────────────────────────

@router.post("/sports/bulk-settle", summary="[트랙B] 한방 전체 정산 (CLOSED 경기 일괄)")
async def bulk_settle(
    background: BackgroundTasks,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    try:
        report = bulk_settle_pending(
            db, actor=user,
            actor_ip=request.client.host if request else None,
        )
        db.commit()
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    background.add_task(
        admin_ws_manager.broadcast_event,
        "settlement",
        {
            "type": "bulk_settled",
            "batch_key": report.batch_key,
            "matches": report.matches_processed,
            "total_bets": report.total_bets,
            "total_payout": str(report.total_payout),
        },
    )
    return {
        "ok": True,
        "batch_key": report.batch_key,
        "matches_processed": report.matches_processed,
        "total_bets": report.total_bets,
        "total_payout": str(report.total_payout),
        "total_rolling": str(report.total_rolling),
        "errors": report.errors,
    }


# ─── 한방 정산 대기 요약 ──────────────────────────────────────────────────────

@router.get("/sports/pending-summary", summary="한방 정산 대기 요약")
def pending_summary(
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    # CLOSED & result 확정 & 미정산 경기
    closed_cnt = db.scalar(
        select(func.count(SportsMatch.id)).where(
            SportsMatch.status == "CLOSED",
            SportsMatch.result.is_not(None),
        )
    ) or 0

    # 해당 경기들의 PENDING 배팅 합계
    pending_bets = db.scalar(
        select(func.count(SportsBet.id)).where(SportsBet.status.in_(["PENDING", "PARTIAL_VOID"]))
    ) or 0
    pending_stake = db.scalar(
        select(func.coalesce(func.sum(SportsBet.stake), 0)).where(
            SportsBet.status.in_(["PENDING", "PARTIAL_VOID"])
        )
    ) or Decimal("0")
    potential_payout = db.scalar(
        select(func.coalesce(func.sum(SportsBet.potential_win), 0)).where(
            SportsBet.status.in_(["PENDING", "PARTIAL_VOID"])
        )
    ) or Decimal("0")

    return {
        "pending_matches": closed_cnt,
        "pending_bets": pending_bets,
        "pending_stake": str(pending_stake),
        "max_potential_payout": str(potential_payout),
    }


# ─── 경기별 배팅 현황 (Accordion 용) ─────────────────────────────────────────

@router.get("/sports/matches/{match_id}/bets", summary="경기별 배팅 현황")
def match_bets(
    match_id: int,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
) -> Dict[str, Any]:
    scope = _get_scope_ids(db, user)
    stmt = (
        select(SportsBet)
        .join(SportsSlip, SportsSlip.bet_id == SportsBet.id)
        .where(SportsSlip.match_id == match_id)
        .distinct()
        .limit(limit)
    )
    if scope is not None:
        stmt = stmt.where(SportsBet.user_id.in_(scope))
    bets = db.scalars(stmt).all()
    return {"match_id": match_id, "bets": [_bet_dict(b) for b in bets]}


# ─── 배팅 등록 (내부/데모용) ─────────────────────────────────────────────────

@router.post("/sports/bets", summary="배팅 등록 (내부/테스트)")
def place_sports_bet(
    body: BetCreateBody,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    for slip in body.slips:
        mid = int(slip["match_id"])
        m = db.get(SportsMatch, mid)
        if m is None:
            raise HTTPException(status_code=404, detail=f"경기 없음: {mid}")
        if m.status != "OPEN":
            raise HTTPException(status_code=400, detail="OPEN 상태가 아닌 경기가 포함되어 있습니다.")
        if match_kickoff_has_passed(m.match_at):
            raise HTTPException(status_code=400, detail="이미 시작된 경기에는 베팅할 수 없습니다.")

    stake = Decimal(body.stake)
    combined_odds = Decimal("1")
    for slip in body.slips:
        combined_odds *= Decimal(str(slip.get("odds_at_bet", "1")))
    combined_odds = combined_odds.quantize(Decimal("0.0001"))
    potential_win = (stake * combined_odds).quantize(Decimal("0.000001"))

    bet = SportsBet(
        user_id=body.user_id,
        stake=stake,
        combined_odds=combined_odds,
        potential_win=potential_win,
        status="PENDING",
    )
    db.add(bet)
    db.flush()

    for s in body.slips:
        db.add(SportsSlip(
            bet_id=bet.id,
            match_id=int(s["match_id"]),
            selected_outcome=s["selected_outcome"].upper(),
            odds_at_bet=Decimal(str(s["odds_at_bet"])),
        ))

    # 배팅 차감 tx
    better = db.get(User, body.user_id)
    if better:
        new_bal = better.game_money_balance - stake
        better.game_money_balance = new_bal
        db.add(SportsTx(
            user_id=body.user_id, bet_id=bet.id,
            tx_type="BET_STAKE", amount=-stake,
            balance_after=new_bal,
            note=f"sports bet placed",
        ))
        create_bet_history_for_sports_bet(
            db, user_id=body.user_id, sports_bet_id=bet.id, stake=stake
        )

    db.commit()
    db.refresh(bet)
    return _bet_dict(bet)
