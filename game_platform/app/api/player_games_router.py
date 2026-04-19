"""플레이어(회원) 전용 미니게임 API: 파워볼·스포츠(토토) 배팅."""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, or_, select
from sqlalchemy.orm import Session, joinedload

from app.constants import USER_ROLE_PLAYER
from app.core.config import settings
from app.core.database import get_db
from app.dependencies.auth_jwt import get_current_user_from_token
from app.models.powerball import PowerballBet, PowerballGameState, PowerballRound
from app.models.site_config import SiteConfig
from app.models.sports import SportsBet, SportsMatch, SportsSlip, SportsTx
from app.models.user import User
from app.services.sports_bet_history_bridge import create_bet_history_for_sports_bet
from app.services.bet_limit_service import effective_limits
from app.services.player_presence import touch_player_presence
from app.services.sports_betting_time import match_kickoff_has_passed, utc_now
from app.services.casino_wallet_service import (
    get_casino_wallet_status,
    transfer_casino_to_main,
    transfer_main_to_casino,
)
from app.services.game_provider_policy import (
    assert_launch_allowed,
    filter_catalog_provider_rows,
    merged_provider_flags,
)
from app.services.powerball_service import (
    POWERBALL_SMALL_ROUND_CEIL,
    VALID_PICKS,
    configured_powerball_game_keys,
    get_next_round,
    live_iframe_src,
    merged_powerball_odds_map,
    place_powerball_bet,
    powerball_games_catalog,
    validate_pick_string,
)
router = APIRouter()


def require_player_user(
    request: Request,
    user: User = Depends(get_current_user_from_token),
) -> User:
    if user.role != USER_ROLE_PLAYER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="회원 전용입니다.",
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="비활성화된 계정입니다.")
    touch_player_presence(request, user)
    return user


def _pb_round_dict(r: PowerballRound) -> dict[str, Any]:
    return {
        "game_key": r.game_key,
        "round_no": r.round_no,
        "num": r.num,
        "pb": r.pb,
        "sum": r.sum_val,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _pb_bet_dict(b: PowerballBet) -> dict[str, Any]:
    return {
        "id": b.id,
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


def _sport_match_dict(m: SportsMatch) -> Dict[str, Any]:
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
        "odds": [
            {"outcome": str(o.outcome or "").strip().upper(), "odds_value": str(o.odds_value)}
            for o in (m.odds or [])
        ],
    }


class PlayerPowerballBetBody(BaseModel):
    pick: str = Field(..., description="단일 또는 조합 sum_odd|pb_even")
    amount: str = Field(..., description="게임머니 스테이크")
    game_key: str = Field(
        default="coinpowerball3",
        description="종목 키 (overview.games[].key)",
    )


class PlayerSportsBetBody(BaseModel):
    stake: str
    slips: List[Dict[str, Any]] = Field(
        ...,
        description="[{match_id, selected_outcome, odds_at_bet}, …]",
    )


@router.get("/games/powerball/overview")
def player_powerball_overview(
    game_key: Optional[str] = Query(None, description="선택 종목(비우면 목록 첫 종목)"),
    recent_limit: int = Query(
        288,
        ge=10,
        le=400,
        description="최근 회차 수(통계·출줄). 기본 288, 폴링 부담 시 80 등으로 낮출 수 있음.",
    ),
    user: User = Depends(require_player_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    site = db.get(SiteConfig, user.site_id)
    if site is None or not site.is_powerball_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="이 사이트에서 파워볼이 비활성화되어 있습니다.",
        )
    if not settings.POWERBALL_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="파워볼 서비스가 일시 중지되었습니다.",
        )
    db.refresh(user)
    keys = configured_powerball_game_keys()
    gk = (game_key or (keys[0] if keys else "coinpowerball3")).strip()
    if gk not in keys:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 game_key: {gk}")
    next_r = get_next_round(db, gk)
    lim = max(10, min(int(recent_limit or 288), 400))
    st_row = db.get(PowerballGameState, gk)
    api_last = int(st_row.last_api_round or 0) if st_row is not None else 0
    stmt = select(PowerballRound).where(PowerballRound.game_key == gk)
    # 작은 std_round 모드일 때는 DB에 남은 YYYYMMDD+ 레거시 결과를 목록에서 제외(표시·프론트 회차 보정 오류 방지)
    if 0 < api_last < POWERBALL_SMALL_ROUND_CEIL:
        stmt = stmt.where(PowerballRound.round_no < POWERBALL_SMALL_ROUND_CEIL)
    recent = list(
        db.scalars(stmt.order_by(desc(PowerballRound.round_no)).limit(lim)).all()
    )
    odds_map = merged_powerball_odds_map(db, user.site_id)
    odds_by_pick = {k: str(v) for k, v in sorted(odds_map.items())}
    mn, mx = effective_limits(site, user, "POWERBALL")

    return {
        "balance": str(user.game_money_balance),
        "next_round": next_r,
        "min_bet": str(mn),
        "max_bet": str(mx),
        "odds_by_pick": odds_by_pick,
        "valid_picks": sorted(VALID_PICKS),
        "recent_rounds": [_pb_round_dict(x) for x in recent],
        "live_iframe_url": live_iframe_src(gk),
        "game_key": gk,
        "games": powerball_games_catalog(db),
    }


@router.post("/games/powerball/bets")
def player_powerball_place_bet(
    body: PlayerPowerballBetBody,
    user: User = Depends(require_player_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    site = db.get(SiteConfig, user.site_id)
    if site is None or not site.is_powerball_enabled:
        raise HTTPException(status_code=403, detail="파워볼이 비활성화되어 있습니다.")
    if not settings.POWERBALL_ENABLED:
        raise HTTPException(status_code=503, detail="파워볼 서비스가 일시 중지되었습니다.")
    try:
        amt = Decimal(body.amount)
    except Exception as e:
        raise HTTPException(status_code=400, detail="금액 형식이 올바르지 않습니다.") from e
    res = place_powerball_bet(
        db, user_id=user.id, pick=body.pick, amount=amt, game_key=body.game_key
    )
    if not res.ok:
        raise HTTPException(status_code=400, detail=res.detail or "배팅 실패")
    db.commit()
    return {"ok": True, "bet_id": res.bet_id}


@router.get("/games/powerball/my-bets")
def player_powerball_my_bets(
    user: User = Depends(require_player_user),
    db: Session = Depends(get_db),
    limit: int = Query(40, ge=1, le=200),
    game_key: Optional[str] = Query(None, description="종목 필터(비우면 전체)"),
) -> dict[str, Any]:
    site = db.get(SiteConfig, user.site_id)
    if site is None or not site.is_powerball_enabled:
        raise HTTPException(status_code=403, detail="파워볼이 비활성화되어 있습니다.")
    stmt = select(PowerballBet).where(PowerballBet.user_id == user.id)
    if game_key and game_key.strip():
        stmt = stmt.where(PowerballBet.game_key == game_key.strip())
    rows = list(
        db.scalars(stmt.order_by(desc(PowerballBet.id)).limit(limit)).all(),
    )
    return {"items": [_pb_bet_dict(b) for b in rows]}


@router.get("/games/sports/matches")
def player_sports_open_matches(
    user: User = Depends(require_player_user),
    db: Session = Depends(get_db),
    scope: str = Query(
        "open",
        description="open=배팅 가능(OPEN·킥오프 전), closed=마감·종료(시간 경과 또는 상태 비-OPEN)",
    ),
    limit: int = Query(120, ge=1, le=200),
) -> dict[str, Any]:
    site = db.get(SiteConfig, user.site_id)
    if site is None or not site.is_toto_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="이 사이트에서 스포츠(토토)가 비활성화되어 있습니다.",
        )
    s = (scope or "open").strip().lower()
    if s not in ("open", "closed"):
        raise HTTPException(status_code=400, detail="scope는 open 또는 closed 만 허용됩니다.")
    now = utc_now()
    if s == "open":
        stmt = (
            select(SportsMatch)
            .options(joinedload(SportsMatch.odds))
            .where(SportsMatch.status == "OPEN", SportsMatch.match_at > now)
            .order_by(SportsMatch.match_at.asc())
            .limit(limit)
        )
    else:
        # 마감: 킥오프 지난 OPEN(관리자가 아직 CLOSED 안 건 경우 포함) + CLOSED/SETTLED/CANCELLED
        closed_cond = or_(
            SportsMatch.status != "OPEN",
            SportsMatch.match_at <= now,
        )
        stmt = (
            select(SportsMatch)
            .options(joinedload(SportsMatch.odds))
            .where(closed_cond)
            .order_by(SportsMatch.match_at.desc())
            .limit(limit)
        )
    rows = list(db.scalars(stmt).unique().all())
    db.refresh(user)
    return {
        "balance": str(user.game_money_balance),
        "scope": s,
        "items": [_sport_match_dict(m) for m in rows],
    }


@router.post("/games/sports/bets")
def player_sports_place_bet(
    body: PlayerSportsBetBody,
    user: User = Depends(require_player_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    site = db.get(SiteConfig, user.site_id)
    if site is None or not site.is_toto_enabled:
        raise HTTPException(status_code=403, detail="스포츠(토토)가 비활성화되어 있습니다.")
    if not body.slips:
        raise HTTPException(status_code=400, detail="경기 선택이 필요합니다.")
    try:
        stake = Decimal(body.stake)
    except Exception as e:
        raise HTTPException(status_code=400, detail="금액 형식이 올바르지 않습니다.") from e
    if stake <= 0:
        raise HTTPException(status_code=400, detail="배팅 금액이 올바르지 않습니다.")
    smn, smx = effective_limits(site, user, "SPORTS")
    if stake < smn:
        raise HTTPException(
            status_code=400,
            detail=f"스포츠 최소 배팅금은 {smn} 입니다.",
        )
    if stake > smx:
        raise HTTPException(
            status_code=400,
            detail=f"스포츠 1회 최대 배팅금은 {smx} 입니다.",
        )

    combined_odds = Decimal("1")
    validated: List[Dict[str, Any]] = []

    for raw in body.slips:
        mid = int(raw["match_id"])
        m = db.scalar(
            select(SportsMatch)
            .options(joinedload(SportsMatch.odds))
            .where(SportsMatch.id == mid),
        )
        if m is None:
            raise HTTPException(status_code=400, detail=f"경기를 찾을 수 없습니다: {mid}")
        if m.status != "OPEN":
            raise HTTPException(status_code=400, detail="베팅이 마감된 경기가 포함되어 있습니다.")
        if match_kickoff_has_passed(m.match_at):
            raise HTTPException(
                status_code=400,
                detail="이미 시작된 경기에는 베팅할 수 없습니다. 목록을 새로고침해 주세요.",
            )
        sel = str(raw.get("selected_outcome", "")).strip().upper()
        odd_row = next((o for o in (m.odds or []) if o.outcome == sel), None)
        if odd_row is None:
            raise HTTPException(status_code=400, detail="선택한 결과가 경기에 없습니다.")
        try:
            client_odd = Decimal(str(raw.get("odds_at_bet", "0")))
        except Exception as e:
            raise HTTPException(status_code=400, detail="배당 형식 오류") from e
        if client_odd != odd_row.odds_value:
            raise HTTPException(
                status_code=409,
                detail="배당이 변경되었습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.",
            )
        combined_odds = (combined_odds * odd_row.odds_value).quantize(Decimal("0.0001"))
        validated.append(
            {"match_id": mid, "selected_outcome": sel, "odds_at_bet": odd_row.odds_value},
        )

    potential_win = (stake * combined_odds).quantize(Decimal("0.000001"))

    locked = db.scalars(select(User).where(User.id == user.id).with_for_update()).one()
    if locked.game_money_balance < stake:
        raise HTTPException(status_code=400, detail="잔액이 부족합니다.")

    bet = SportsBet(
        user_id=user.id,
        stake=stake,
        combined_odds=combined_odds,
        potential_win=potential_win,
        status="PENDING",
    )
    db.add(bet)
    db.flush()

    for s in validated:
        db.add(
            SportsSlip(
                bet_id=bet.id,
                match_id=s["match_id"],
                selected_outcome=s["selected_outcome"],
                odds_at_bet=s["odds_at_bet"],
            ),
        )

    new_bal = (locked.game_money_balance - stake).quantize(Decimal("0.000001"))
    locked.game_money_balance = new_bal
    db.add(
        SportsTx(
            user_id=user.id,
            bet_id=bet.id,
            tx_type="BET_STAKE",
            amount=-stake,
            balance_after=new_bal,
            note="player sports bet",
        ),
    )
    create_bet_history_for_sports_bet(
        db, user_id=user.id, sports_bet_id=bet.id, stake=stake
    )

    db.commit()
    db.refresh(bet)
    slips_db = list(
        db.scalars(select(SportsSlip).where(SportsSlip.bet_id == bet.id)).all(),
    )
    return {
        "id": bet.id,
        "user_id": bet.user_id,
        "stake": str(bet.stake),
        "combined_odds": str(bet.combined_odds),
        "potential_win": str(bet.potential_win),
        "status": bet.status,
        "balance_after": str(new_bal),
        "slips": [
            {
                "match_id": s.match_id,
                "selected_outcome": s.selected_outcome,
                "odds_at_bet": str(s.odds_at_bet),
            }
            for s in slips_db
        ],
    }


@router.get("/games/powerball/validate-pick")
def player_validate_pick(pick: str) -> dict[str, Any]:
    err = validate_pick_string(pick)
    return {"ok": err is None, "error": err}


# ---------------------------------------------------------------------------
# 카지노 게임 실행 (Plxmed) — JWT 인증 사용
# ---------------------------------------------------------------------------

import hashlib
import json as _json
import httpx as _httpx


def _v6_catalog_base_url() -> str:
    raw = (settings.V6_CASINO_CATALOG_BASE or "").strip().rstrip("/")
    if raw:
        return raw
    return (settings.V6_API_BASE or "").strip().rstrip("/")


def _catalog_kind_from_category(category: str) -> str:
    return "slot" if "slot" in (category or "").lower() else "casino"


@router.get("/games/casino/providers", summary="라이브/슬롯 게임사 목록 (V6 카탈로그 프록시)")
async def player_casino_providers_catalog(
    category: str = Query(
        "Live+Casino",
        description="업스트림 category (예: Live+Casino, Slots)",
    ),
    user: User = Depends(require_player_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    site = db.get(SiteConfig, user.site_id)
    if site is None or not site.is_casino_enabled:
        raise HTTPException(
            status_code=403,
            detail="카지노·슬롯이 비활성화된 사이트입니다.",
        )
    base = _v6_catalog_base_url()
    if not base:
        return {"data": []}
    kind = _catalog_kind_from_category(category)
    try:
        async with _httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(
                f"{base}/api/v1/casino/providers",
                params={"category": category},
            )
    except Exception:
        return {"data": []}
    if r.status_code >= 400:
        return {"data": []}
    try:
        data = r.json()
    except Exception:
        return {"data": []}
    rows = data.get("data") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        return {"data": []}
    return {"data": filter_catalog_provider_rows(rows, site, kind=kind)}


@router.get("/games/casino/games", summary="카지노/슬롯 게임 목록 (V6 카탈로그 프록시)")
async def player_casino_games_catalog(
    provider_id: int = Query(..., ge=1),
    category: str = Query("Live+Casino"),
    page: int = Query(1, ge=1),
    limit: int = Query(24, ge=1, le=100),
    user: User = Depends(require_player_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    site = db.get(SiteConfig, user.site_id)
    if site is None or not site.is_casino_enabled:
        raise HTTPException(
            status_code=403,
            detail="카지노·슬롯이 비활성화된 사이트입니다.",
        )
    base = _v6_catalog_base_url()
    if not base:
        return {"data": [], "total": 0}
    try:
        async with _httpx.AsyncClient(timeout=25.0) as client:
            r = await client.get(
                f"{base}/api/v1/casino/games",
                params={
                    "provider_id": provider_id,
                    "category": category,
                    "page": page,
                    "limit": limit,
                },
            )
    except Exception:
        return {"data": [], "total": 0}
    if r.status_code >= 400:
        return {"data": [], "total": 0}
    try:
        data = r.json()
    except Exception:
        return {"data": [], "total": 0}
    if not isinstance(data, dict):
        return {"data": [], "total": 0}
    inner = data.get("data")
    if inner is not None and not isinstance(inner, list):
        data["data"] = []
    return data


@router.get("/games/provider-flags", summary="게임사 ON/OFF (site_policies.game_providers)")
def player_game_provider_flags(
    user: User = Depends(require_player_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    site = db.get(SiteConfig, user.site_id)
    return merged_provider_flags(site)


# ---------------------------------------------------------------------------
# 카지노 지갑 ↔ 메인 게임머니 (Plxmed)
# ---------------------------------------------------------------------------


class CasinoWalletAmountBody(BaseModel):
    amount: str = Field(..., description="전환 금액 (문자열)")


@router.get("/games/casino/wallet-status", summary="카지노 지갑·게임머니 잔액")
def player_casino_wallet_status(
    user: User = Depends(require_player_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return get_casino_wallet_status(db, user)


@router.post("/games/casino/wallet/transfer-to-casino", summary="게임머니 → 카지노 지갑")
def player_casino_transfer_to_casino(
    body: CasinoWalletAmountBody,
    user: User = Depends(require_player_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return transfer_main_to_casino(db, user, body.amount)


@router.post("/games/casino/wallet/transfer-from-casino", summary="카지노 지갑 → 게임머니")
def player_casino_transfer_from_casino(
    body: CasinoWalletAmountBody,
    user: User = Depends(require_player_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return transfer_casino_to_main(db, user, body.amount)


class CasinoLaunchBody(BaseModel):
    game_id: int  # Plxmed 숫자 게임 ID (casino_games.plxmed_game_id)
    lang: str = "KO"
    return_url: str = "/"
    provider_key: Optional[str] = Field(
        None,
        description="어드민 게임사 제한과 동일 키(evolution 등). 없으면 구 클라이언트와 동일하게 검증 생략.",
    )
    game_kind: str = Field(
        "casino",
        description="casino | slot — game_providers.casino / .slot 구분",
    )


def _build_plxmed_headers(payload: dict) -> dict:
    """Plxmed Authorization Bearer MD5 서명 헤더 생성."""
    from app.core.config import settings as _s
    serialized = _json.dumps(payload, separators=(",", ":"), ensure_ascii=False, sort_keys=False)
    sig = hashlib.md5((_s.PLXMED_SECURITY_KEY + serialized).encode()).hexdigest()
    return {
        "client_id": str(_s.PLXMED_CLIENT_ID),
        "Authorization": f"Bearer {sig}",
        "Content-Type": "application/json",
    }


@router.post("/games/casino/launch")
async def player_casino_launch(
    body: CasinoLaunchBody,
    user: User = Depends(require_player_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    JWT 로그인한 플레이어가 카지노 게임을 실행하는 엔드포인트.
    game_platform DB 유저의 login_id로 Plxmed 계정을 생성/조회한 뒤 게임 URL을 반환한다.
    game_id: casino_games.plxmed_game_id (Plxmed 내부 숫자 ID)
    """
    from app.core.config import settings as _s

    site = db.get(SiteConfig, user.site_id)
    if site is None or not site.is_casino_enabled:
        raise HTTPException(status_code=403, detail="카지노·슬롯이 비활성화된 사이트입니다.")
    gk = (body.game_kind or "casino").strip().lower()
    if gk not in ("casino", "slot"):
        raise HTTPException(status_code=400, detail="game_kind 은 casino 또는 slot 입니다.")
    pk = (body.provider_key or "").strip() or None
    assert_launch_allowed(site, kind=gk, catalog_key=pk)

    username = f"sp_{user.login_id}"
    password = f"sp{user.login_id}pw"
    email = getattr(user, "email", None) or f"{user.login_id}@player.local"
    base = _s.PLXMED_API_BASE.rstrip("/")

    async with _httpx.AsyncClient(timeout=15.0) as http:
        # 1) createaccount (이미 존재하면 로그인처럼 동작)
        acc_payload = {
            "username": username,
            "password": password,
            "email": email,
            "first_name": user.login_id,
            "last_name": "",
        }
        acc_headers = _build_plxmed_headers(acc_payload)
        acc_resp = await http.post(f"{base}/createaccount", json=acc_payload, headers=acc_headers)
        acc_data = acc_resp.json()
        code = acc_data.get("status") or acc_data.get("code")
        if code not in (None, 0, "0", "success", "SUCCESS", True):
            raise HTTPException(status_code=502, detail=f"카지노 계정 오류: {acc_data.get('message', code)}")

        inner = acc_data.get("data") or {}
        usercode = inner.get("usercode", "")
        token = inner.get("token", "")
        if not usercode or not token:
            raise HTTPException(status_code=502, detail="카지노 계정 정보를 받지 못했습니다.")

        # 2) getGameUrl — game 파라미터는 Plxmed 숫자 게임 ID
        url_payload = {
            "usercode": usercode,
            "mode": "real",
            "game": body.game_id,
            "lang": body.lang,
            "token": token,
            "return_url": body.return_url,
        }
        url_headers = _build_plxmed_headers(url_payload)
        url_resp = await http.post(f"{base}/getGameUrl", json=url_payload, headers=url_headers)
        url_data = url_resp.json()
        # Plxmed는 data.return_url 키로 게임 URL 반환
        data_inner = url_data.get("data") or {}
        game_url = (
            data_inner.get("return_url") or
            data_inner.get("game_url") or
            data_inner.get("url") or
            ""
        )
        if not game_url:
            err_msg = url_data.get("message", "알 수 없는 오류")
            raise HTTPException(status_code=502, detail=f"게임 URL 오류: {err_msg}")

        # Evolution: /entry URL로 GET 요청 → EVOSESSIONID 쿠키 받아서 로비 URL 반환
        if "evo-games.com/entry" in game_url:
            import httpx as _hx
            async with _hx.AsyncClient(timeout=15.0, follow_redirects=False) as sess:
                evo_resp = await sess.get(game_url)
                # /entry → /entry?cc=1 → /frontend/evo/r2/ 로 리다이렉트됨
                # 쿠키에서 EVOSESSIONID 추출
                evosession = evo_resp.cookies.get("EVOSESSIONID", "")
                if not evosession:
                    # 리다이렉트 따라가기
                    loc = evo_resp.headers.get("location", "")
                    if loc:
                        evo_resp2 = await sess.get(loc if loc.startswith("http") else f"https://skylineplxmd.evo-games.com{loc}")
                        evosession = evo_resp2.cookies.get("EVOSESSIONID", "")
                if evosession:
                    base_evo = game_url.split("/entry")[0]
                    game_url = f"{base_evo}/frontend/evo/r2/?EVOSESSIONID={evosession}"

    return {"url": game_url, "usercode": usercode}
