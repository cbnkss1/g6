"""파워볼: 외부 API 수집 → 종목(game_key)별 회차 저장 → 해당 회차 배팅 정산 (게임머니)."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from functools import reduce
from operator import mul
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.http_client import fetch_json_get
from app.models.bet import BetHistory
from app.models.enums import BetStatus, GameMoneyLedgerReason, GameResult, GameType
from app.models.ledger import GameMoneyLedgerEntry
from app.models.powerball import PowerballBet, PowerballGameState, PowerballRound
from app.models.site_config import SiteConfig
from app.models.user import User
from app.services.bet_limit_service import effective_limits
from app.services.differential_commission_service import DifferentialCommissionService
from app.services.settlement_basis import valid_bet_amount_for_rolling

Q = Decimal("0.000001")


def _apply_powerball_differential_commission(db: Session, bet: PowerballBet) -> None:
    """통합 배팅 로그 기준 차액 롤링·루징 (배팅 1건)."""
    ext = f"gp_pb_{bet.id}"
    hist = db.scalar(
        select(BetHistory).where(BetHistory.external_bet_uid == ext).with_for_update()
    )
    if hist is None:
        return
    win_amt = hist.win_amount or Decimal("0")
    gr = hist.game_result
    vb = valid_bet_amount_for_rolling(bet.amount, gr)
    DifferentialCommissionService.apply(
        db,
        bettor_user_id=bet.user_id,
        game_type=GameType.POWERBALL.value,
        valid_stake_for_rolling=vb,
        stake_amount=bet.amount,
        win_amount=win_amt,
        bet_history_id=hist.id,
        ledger_reference_type="BET",
        ledger_reference_id=str(hist.id),
        game_result=gr,
    )


# v6 bbs/game_powerball_live._POWERBALL_LIVE_IFRAME_BY_KEY 와 동기
_POWERBALL_LIVE_IFRAME_BY_KEY: dict[str, str] = {
    "coinpowerball3": "https://bepick.net/live/coinpower3/scrap",
    "coinpowerball5": "https://bepick.net/live/coinpower5/scrap",
    "eospowerball3": "https://bepick.net/live/coinpower5/scrap",
    "eospowerball": "https://bepick.net/live/eosball5m/scrap",
    "pbg": "https://bepick.net/live/pbgpowerball/scrap",
}

POWERBALL_GAME_LABELS: dict[str, str] = {
    "coinpowerball3": "코인 3분",
    "coinpowerball5": "코인 5분",
    "eospowerball3": "EOS 3분",
    "eospowerball": "EOS 5분",
    "pbg": "PBG",
}


def configured_powerball_game_keys() -> List[str]:
    """
    콤마 구분 POWERBALL_GAME_KEYS.
    비어 있으면 POWERBALL_GAME_KEY 단일 종목 (기존 배포 호환).

    POWERBALL_GAME_KEYS=\",,,\" 처럼 잘못 넣으면 예전에는 [] 가 되어
    overview 가 400(지원하지 않는 game_key)으로 떨어지고 UI가 전부 깨졌음 → 절대 빈 리스트 반환 안 함.
    """
    raw = (settings.POWERBALL_GAME_KEYS or "").strip()
    if raw:
        keys = [x.strip() for x in raw.split(",") if x.strip()]
        if keys:
            return keys
    k = (settings.POWERBALL_GAME_KEY or "coinpowerball3").strip() or "coinpowerball3"
    return [k]


def live_iframe_src(game_key: Optional[str] = None) -> str:
    """플레이어·어드민에서 실시간 화면 iframe src 로 사용."""
    override = (getattr(settings, "POWERBALL_LIVE_IFRAME_URL", "") or "").strip()
    if override:
        return override
    key = (game_key or settings.POWERBALL_GAME_KEY or "coinpowerball3").strip()
    return _POWERBALL_LIVE_IFRAME_BY_KEY.get(
        key, _POWERBALL_LIVE_IFRAME_BY_KEY["coinpowerball3"]
    )


def powerball_games_catalog(db: Session) -> List[Dict[str, Any]]:
    """플레이어/어드민용 종목 목록 + 다음 회차 + 라이브 URL."""
    out: List[Dict[str, Any]] = []
    for gk in configured_powerball_game_keys():
        out.append(
            {
                "key": gk,
                "label": POWERBALL_GAME_LABELS.get(gk, gk),
                "next_round": get_next_round(db, gk),
                "live_iframe_url": live_iframe_src(gk),
            }
        )
    return out


VALID_PICKS = frozenset(
    {
        "sum_odd",
        "sum_even",
        "sum_under",
        "sum_over",
        "size_s",
        "size_m",
        "size_l",
        "pb_odd",
        "pb_even",
        "pb_under",
        "pb_over",
    }
)

_ODDS_MIN = Decimal("1")
_ODDS_MAX = Decimal("999")


def default_powerball_odds_map() -> Dict[str, Decimal]:
    """환경 기본 배당으로 모든 유효 픽 채움 (v6 포인트 파워볼·엔진과 동일 단일값 개념)."""
    base = Decimal(str(settings.POWERBALL_ODDS)).quantize(Decimal("0.0001"))
    return {k: base for k in VALID_PICKS}


def merged_powerball_odds_map(db: Session, site_id: uuid.UUID) -> Dict[str, Decimal]:
    """사이트에 저장된 JSON을 합치고, 없는 키·잘못된 값은 기본값."""
    out = default_powerball_odds_map()
    site = db.get(SiteConfig, site_id)
    if site is None or not site.powerball_odds or not isinstance(site.powerball_odds, dict):
        return out
    for k, v in site.powerball_odds.items():
        if k not in VALID_PICKS:
            continue
        try:
            d = Decimal(str(v)).quantize(Decimal("0.0001"))
            if _ODDS_MIN <= d <= _ODDS_MAX:
                out[k] = d
        except Exception:
            continue
    return out


def effective_betting_odds_for_pick(odds_map: Dict[str, Decimal], pick: str) -> Decimal:
    """
    단일 픽: 해당 배당.
    조합(a|b): 각 픽 배당의 곱 (파워볼 조합 배당).
    """
    parts = [p.strip() for p in pick.strip().split("|") if p.strip()]
    if not parts:
        return Decimal("1")
    legs = [odds_map[p] for p in parts]
    return reduce(mul, legs, Decimal("1")).quantize(Decimal("0.0001"))


def _ensure_game_state(db: Session, game_key: str) -> PowerballGameState:
    gk = game_key.strip()
    st = db.get(PowerballGameState, gk)
    if st is None:
        st = PowerballGameState(game_key=gk, last_api_round=0)
        db.add(st)
        db.flush()
    return st


# 피드 `std_round` 가 일·회차용 작은 정수(< 이 값)인 경우와, 예전 YYYYMMDD+ 대형 회차 번호가 공존할 때 구분
_SMALL_STD_ROUND_CEIL = 100_000_000
POWERBALL_SMALL_ROUND_CEIL = _SMALL_STD_ROUND_CEIL


def get_next_round(db: Session, game_key: str) -> int:
    """다음 배팅 회차.

    - API가 `std_round` 를 작은 정수로 주는 모드: `last_api_round+1` 을 우선(레거시 대형 round_no 행과 max 충돌 방지).
    - 그 외(구 YYYYMMDD+ 체계): 기존처럼 ``max(DB 결과 회차)+1`` 과 ``last_api_round+1`` 중 큰 값.
    """
    gk = game_key.strip()
    st = _ensure_game_state(db, gk)
    api_last = int(st.last_api_round or 0)

    if 0 < api_last < _SMALL_STD_ROUND_CEIL:
        return api_last + 1

    m = db.scalar(select(func.max(PowerballRound.round_no)).where(PowerballRound.game_key == gk))
    from_db = int(m) + 1 if m is not None else 1
    if api_last > 0:
        from_api = api_last + 1
        return max(from_api, from_db)
    return from_db


def is_pick_win(pick: str, sum_val: int, powerball: int) -> bool:
    if pick == "sum_odd":
        return sum_val % 2 == 1
    if pick == "sum_even":
        return sum_val % 2 == 0
    if pick == "sum_under":
        return sum_val <= 72
    if pick == "sum_over":
        return sum_val >= 73
    if pick == "size_s":
        return sum_val <= 72
    if pick == "size_m":
        return 73 <= sum_val <= 80
    if pick == "size_l":
        return sum_val >= 81
    if pick == "pb_odd":
        return powerball % 2 == 1
    if pick == "pb_even":
        return powerball % 2 == 0
    if pick == "pb_under":
        return powerball <= 4
    if pick == "pb_over":
        return powerball >= 5
    return False


def parse_game_payload(data: dict, game_key: str) -> tuple[int, str, int, int, dict]:
    if game_key not in data:
        raise KeyError(f"missing game key: {game_key}")
    g = data[game_key]
    if not isinstance(g, dict):
        raise TypeError("game value must be object")
    api_round = int(g.get("std_round") or 0)
    balls = g.get("num") or ""
    if not isinstance(balls, str):
        balls = str(balls)
    pb = int(g.get("pb") or 0)
    s = int(g.get("sum") or 0)
    return api_round, balls, pb, s, g


def round_exists(db: Session, game_key: str, round_no: int) -> bool:
    return (
        db.scalar(
            select(PowerballRound.id)
            .where(PowerballRound.game_key == game_key, PowerballRound.round_no == round_no)
            .limit(1)
        )
        is not None
    )


def insert_round(
    db: Session, game_key: str, round_no: int, balls: str, pb: int, s: int, raw_obj: dict
) -> None:
    first_num: Optional[int] = None
    parts = [x.strip() for x in (balls or "").split(",") if str(x).strip()]
    if parts and parts[0].isdigit():
        first_num = int(parts[0])
    db.add(
        PowerballRound(
            game_key=game_key,
            round_no=round_no,
            num=first_num,
            pb=pb,
            sum_val=s,
            raw_json=json.dumps(raw_obj, ensure_ascii=False),
        )
    )


def settle_round(db: Session, game_key: str, round_no: int, sum_val: int, powerball: int) -> int:
    """해당 종목·회차 pending 배팅 정산. 처리 건수 반환."""
    bets = list(
        db.scalars(
            select(PowerballBet).where(
                PowerballBet.game_key == game_key,
                PowerballBet.round_no == round_no,
                PowerballBet.status == "pending",
            )
        ).all()
    )
    now = datetime.now(timezone.utc)
    for bet in bets:
        picks = [p.strip() for p in bet.pick.split("|") if p.strip()]
        if not picks:
            bet.status = "lost"
            bet.payout = Decimal("0")
            bet.settled_at = now
            _sync_powerball_bet_history_settled(db, bet, now)
            _apply_powerball_differential_commission(db, bet)
            continue
        all_win = all(is_pick_win(p, sum_val, powerball) for p in picks)
        if all_win:
            payout = (bet.amount * bet.odds).quantize(Q)
            bet.status = "won"
            bet.payout = payout
            user = db.scalars(select(User).where(User.id == bet.user_id).with_for_update()).one()
            nb = (user.game_money_balance + payout).quantize(Q)
            user.game_money_balance = nb
            db.add(
                GameMoneyLedgerEntry(
                    user_id=user.id,
                    delta=payout,
                    balance_after=nb,
                    reason=GameMoneyLedgerReason.POWERBALL_WIN.value,
                    reference_type="POWERBALL_BET",
                    reference_id=str(bet.id),
                )
            )
        else:
            bet.status = "lost"
            bet.payout = Decimal("0")
        bet.settled_at = now
        _sync_powerball_bet_history_settled(db, bet, now)
        _apply_powerball_differential_commission(db, bet)
    return len(bets)


def _sync_powerball_bet_history_settled(db: Session, bet: PowerballBet, now: datetime) -> None:
    """통합 배팅 로그(gp_bet_history) 정산 반영."""
    ext = f"gp_pb_{bet.id}"
    hist = db.scalar(
        select(BetHistory).where(BetHistory.external_bet_uid == ext).with_for_update()
    )
    if hist is None:
        return
    hist.status = BetStatus.SETTLED.value
    hist.settled_at = now
    if bet.status == "won":
        hist.game_result = GameResult.WIN.value
        hist.win_amount = bet.payout
    else:
        hist.game_result = GameResult.LOSE.value
        hist.win_amount = Decimal("0")


def repair_stuck_settlements(db: Session) -> int:
    """
    gp_powerball_rounds 에 결과가 있는데 gp_powerball_bets 가 아직 pending 인 경우 보정.
    (끊김·재시작 등으로 insert 후 정산만 실패한 드문 경우 대비)
    """
    pairs = db.execute(
        select(PowerballBet.game_key, PowerballBet.round_no)
        .where(PowerballBet.status == "pending")
        .distinct()
    ).all()
    total_settled = 0
    for game_key, round_no in pairs:
        row = db.scalar(
            select(PowerballRound).where(
                PowerballRound.game_key == game_key,
                PowerballRound.round_no == round_no,
            )
        )
        if row is None:
            continue
        s = int(row.sum_val or 0)
        pb = int(row.pb or 0)
        total_settled += settle_round(db, game_key, int(round_no), s, pb)
    return total_settled


def list_pending_rounds_without_result(db: Session) -> List[Dict[str, Any]]:
    """
    배팅은 pending 인데 해당 (game_key, round_no) 회차 결과 행이 아직 없는 목록.
    상위 피드가 끊겨 회차가 DB에 안 들어온 경우 → 여기서 회차로 조회 가능(피드가 과거 회차를 주면 poll 로 해소).
    """
    grouped = db.execute(
        select(
            PowerballBet.game_key,
            PowerballBet.round_no,
            func.count(PowerballBet.id),
        )
        .where(PowerballBet.status == "pending")
        .group_by(PowerballBet.game_key, PowerballBet.round_no)
    ).all()
    out: List[Dict[str, Any]] = []
    for game_key, round_no, cnt in grouped:
        rid = db.scalar(
            select(PowerballRound.id).where(
                PowerballRound.game_key == game_key,
                PowerballRound.round_no == round_no,
            ).limit(1)
        )
        if rid is None:
            out.append(
                {
                    "game_key": game_key,
                    "round_no": int(round_no),
                    "pending_bet_count": int(cnt),
                }
            )
    return sorted(out, key=lambda x: (x["game_key"], x["round_no"]))


def probe_upstream() -> dict[str, Any]:
    """DB 없이 외부 파워볼 피드만 확인 (배포·키 검증용)."""
    if not settings.POWERBALL_ENABLED:
        return {"ok": False, "error": "POWERBALL_ENABLED=false"}
    url = settings.POWERBALL_API_URL
    bearer = (settings.POWERBALL_BEARER_TOKEN or "").strip() or None
    ok, data_or_err = fetch_json_get(
        url,
        total_timeout=settings.POWERBALL_HTTP_TIMEOUT,
        connect_timeout=settings.POWERBALL_CONNECT_TIMEOUT,
        bearer_token=bearer,
        retries=settings.POWERBALL_HTTP_RETRIES,
    )
    if not ok:
        return {"ok": False, "error": str(data_or_err)}
    if not isinstance(data_or_err, dict):
        return {"ok": False, "error": "response is not json object"}
    keys = configured_powerball_game_keys()
    missing = [k for k in keys if k not in data_or_err]
    return {
        "ok": len(missing) == 0,
        "configured_keys": keys,
        "missing_keys": missing,
        "response_keys": list(data_or_err.keys())[:40],
    }


def _poll_upstream_and_apply(db: Session) -> dict[str, Any]:
    """외부 1회 수집 + 신규 회차 insert·정산 (복구 로직 제외)."""
    if not settings.POWERBALL_ENABLED:
        return {"ok": False, "error": "POWERBALL_ENABLED=false — 환경변수로 켠 뒤 poll 하세요."}
    url = settings.POWERBALL_API_URL
    keys = configured_powerball_game_keys()
    bearer = (settings.POWERBALL_BEARER_TOKEN or "").strip() or None
    ok, data_or_err = fetch_json_get(
        url,
        total_timeout=settings.POWERBALL_HTTP_TIMEOUT,
        connect_timeout=settings.POWERBALL_CONNECT_TIMEOUT,
        bearer_token=bearer,
        retries=settings.POWERBALL_HTTP_RETRIES,
    )
    if not ok:
        return {"ok": False, "error": str(data_or_err)}
    data = data_or_err
    if not isinstance(data, dict):
        return {"ok": False, "error": "response is not json object"}

    games_out: List[Dict[str, Any]] = []
    errors: List[str] = []

    for key in keys:
        if key not in data:
            errors.append(f"API에 키 없음: {key}")
            continue
        try:
            api_round, balls, pb, s, raw_g = parse_game_payload(data, key)
        except Exception as e:
            errors.append(f"{key}: parse {e}")
            continue
        if api_round <= 0 or not (balls or "").strip():
            errors.append(f"{key}: invalid api_round or balls")
            continue

        st = _ensure_game_state(db, key)
        st.last_api_round = api_round

        if round_exists(db, key, api_round):
            games_out.append(
                {
                    "game_key": key,
                    "skipped": True,
                    "round": api_round,
                    "sum": s,
                    "pb": pb,
                    "next_round": get_next_round(db, key),
                }
            )
            continue

        insert_round(db, key, api_round, balls, pb, s, raw_g)
        settled = settle_round(db, key, api_round, s, pb)
        games_out.append(
            {
                "game_key": key,
                "inserted": True,
                "round": api_round,
                "sum": s,
                "pb": pb,
                "settled_bets": settled,
                "next_round": get_next_round(db, key),
            }
        )

    next_by_game = {gk: get_next_round(db, gk) for gk in keys}

    if not games_out:
        return {
            "ok": False,
            "error": "설정된 종목이 API 응답에 없거나 파싱 실패",
            "errors": errors,
            "response_keys": list(data.keys())[:30],
        }

    return {
        "ok": True,
        "games": games_out,
        "next_round_by_game": next_by_game,
        "errors": errors,
    }


def commit_poll_transaction_if_modified(db: Session) -> bool:
    """
    poll_once 이후: ORM insert/update/delete 가 있을 때만 commit.
    SELECT 만 있었거나 변경이 없으면 rollback 으로 트랜잭션만 닫음(불필요한 빈 commit 방지).

    Returns:
        True: commit 함. False: 변경 없음으로 rollback 함.
    """
    if db.new or db.dirty or db.deleted:
        db.commit()
        return True
    db.rollback()
    return False


def poll_once(db: Session) -> dict[str, Any]:
    """
    외부 수집 + DB 내 보정(결과는 있는데 정산만 안 된 회차) + 대기 갭 목록.
    피드가 실패해도 같은 트랜잭션에서 복구 시도.
    """
    out = _poll_upstream_and_apply(db)
    try:
        out["repaired_settlements"] = repair_stuck_settlements(db)
        out["pending_without_round"] = list_pending_rounds_without_result(db)
    except Exception as e:
        out["recovery_error"] = str(e)[:400]
    # 커밋 직전 스냅샷(응답·로그용). 실제 영속화는 호출부에서 commit_poll_transaction_if_modified 로 결정.
    out["session_had_pending_changes"] = bool(db.new or db.dirty or db.deleted)
    return out


def validate_pick_string(pick: str) -> Optional[str]:
    s = pick.strip()
    if not s:
        return "empty pick"
    parts = [p.strip() for p in s.split("|") if p.strip()]
    for p in parts:
        if p not in VALID_PICKS:
            return f"invalid pick: {p}"
    return None


@dataclass
class PlacePowerballBetResult:
    ok: bool
    detail: str
    bet_id: Optional[int] = None


def place_powerball_bet(
    db: Session, *, user_id: int, pick: str, amount: Decimal, game_key: str
) -> PlacePowerballBetResult:
    gk = game_key.strip()
    allowed = set(configured_powerball_game_keys())
    if gk not in allowed:
        return PlacePowerballBetResult(ok=False, detail="지원하지 않는 game_key 입니다.")

    verr = validate_pick_string(pick)
    if verr:
        return PlacePowerballBetResult(ok=False, detail=verr)
    amt = Decimal(amount).quantize(Q)
    user_pre = db.scalars(select(User).where(User.id == user_id)).one_or_none()
    if user_pre is None:
        return PlacePowerballBetResult(ok=False, detail="user not found")
    site_row = db.get(SiteConfig, user_pre.site_id)
    mn, mx = effective_limits(site_row, user_pre, "POWERBALL")
    if amt < mn:
        return PlacePowerballBetResult(ok=False, detail="최소 배팅금 미만입니다.")
    if amt > mx:
        return PlacePowerballBetResult(ok=False, detail="1회 최대 배팅금을 초과했습니다.")

    next_r = get_next_round(db, gk)
    user = db.scalars(select(User).where(User.id == user_id).with_for_update()).one_or_none()
    if user is None:
        return PlacePowerballBetResult(ok=False, detail="user not found")
    if user.game_money_balance < amt:
        return PlacePowerballBetResult(ok=False, detail="insufficient balance")
    next_r2 = get_next_round(db, gk)
    if next_r2 != next_r:
        return PlacePowerballBetResult(ok=False, detail="round changed, retry")

    odds_map = merged_powerball_odds_map(db, user.site_id)
    odds = effective_betting_odds_for_pick(odds_map, pick.strip())
    nb = (user.game_money_balance - amt).quantize(Q)
    user.game_money_balance = nb

    bet = PowerballBet(
        user_id=user_id,
        game_key=gk,
        round_no=next_r,
        pick=pick.strip(),
        amount=amt,
        odds=odds,
        status="pending",
    )
    db.add(bet)
    db.flush()

    db.add(
        BetHistory(
            external_bet_uid=f"gp_pb_{bet.id}",
            user_id=user_id,
            game_type=GameType.POWERBALL.value,
            status=BetStatus.PENDING.value,
            bet_amount=amt,
        )
    )

    db.add(
        GameMoneyLedgerEntry(
            user_id=user.id,
            delta=-amt,
            balance_after=nb,
            reason=GameMoneyLedgerReason.POWERBALL_STAKE.value,
            reference_type="POWERBALL_BET",
            reference_id=str(bet.id),
        )
    )
    return PlacePowerballBetResult(ok=True, detail="ok", bet_id=bet.id)
