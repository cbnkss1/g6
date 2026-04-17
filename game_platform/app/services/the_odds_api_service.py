"""
The Odds API (api.the-odds-api.com) v4 — 주요 리그 다종목
(h2h · spreads · totals 배당, regions/markets 설정으로 크레딧 절약).

- 무료 쿼터(월 500 등) 보호: 프로세스 로컬 캐시(TTL 기본 60초), 스포츠 간 짧은 간격.
- 종목 수가 늘면 동기화·라이브 피드 1회당 외부 호출 수가 늘어납니다. `THE_ODDS_MAX_EVENTS_PER_SPORT` 로 상한 조절.
- API 키는 환경변수만 (저장소에 커밋 금지).
"""
from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.core.config import settings
from app.services.sports_market_codes import spread_outcome_key, total_outcome_key

# (sport_key, 표시 라벨) — The Odds API 공식 키 (https://the-odds-api.com/sports-odds-data/sports-apis.html)
DEFAULT_SPORT_TARGETS: Tuple[Tuple[str, str], ...] = (
    ("soccer_epl", "EPL"),
    ("soccer_uefa_champs_league", "UEFA 챔피언스리그"),
    ("soccer_spain_la_liga", "라 리가"),
    ("soccer_germany_bundesliga", "분데스리가"),
    ("soccer_italy_serie_a", "세리에 A"),
    ("soccer_france_ligue_one", "리그 1"),
    ("soccer_uefa_europa_league", "유로파리그"),
    ("soccer_netherlands_eredivisie", "에레디비지"),
    ("soccer_portugal_primeira_liga", "프리메이라리가"),
    ("soccer_usa_mls", "MLS"),
    ("soccer_korea_kleague1", "K리그1"),
    ("soccer_japan_j_league", "J리그"),
    ("soccer_mexico_ligamx", "리가 MX"),
    ("basketball_nba", "NBA"),
    ("basketball_euroleague", "유로리그"),
    ("baseball_mlb", "MLB"),
    ("baseball_kbo", "KBO"),
    ("icehockey_nhl", "NHL"),
    ("americanfootball_nfl", "NFL"),
)

# 일부 계정/시즌에서 키 문자열이 다를 수 있어 404 시 순차 시도
_SPORT_KEY_FALLBACK: Dict[str, str] = {
    "soccer_uefa_champs_league": "soccer_uefa_champions_league",
}

_BOOKMAKER_PRIORITY = (
    "pinnacle",
    "betfair_ex_eu",
    "draftkings",
    "fanduel",
    "bet365",
)

_cache_lock = threading.Lock()
_cache_payload: Optional[Dict[str, Any]] = None
_cache_expires_monotonic: float = 0.0
_last_credits_remaining: Optional[str] = None


def _apply_margin_decimal(raw: float, margin_pct: float) -> float:
    """플랫폼 요율: 고객에게 보여줄 배당을 raw 대비 낮춤 (마진 %)."""
    if raw <= 1.0:
        return raw
    factor = max(0.01, 1.0 - margin_pct / 100.0)
    adj = round(raw * factor, 3)
    return max(1.01, adj)


def _pick_bookmaker(bookmakers: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not bookmakers:
        return None
    wanted = (settings.THE_ODDS_BOOKMAKERS or "").strip().lower()
    if wanted:
        for b in bookmakers:
            if str(b.get("key", "")).lower() == wanted:
                return b
    keys = {str(b.get("key", "")).lower(): b for b in bookmakers}
    for pk in _BOOKMAKER_PRIORITY:
        if pk in keys:
            return keys[pk]
    return bookmakers[0]


def _ordered_bookmakers(bookmakers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """우선순위 순으로 북메이커 나열 (spreads/totals 보강용, 중복 제거)."""
    if not bookmakers:
        return []
    keys_map: Dict[str, Dict[str, Any]] = {}
    for b in bookmakers:
        if not isinstance(b, dict):
            continue
        k = str(b.get("key", "")).lower()
        if k and k not in keys_map:
            keys_map[k] = b
    out: List[Dict[str, Any]] = []
    wanted = (settings.THE_ODDS_BOOKMAKERS or "").strip().lower()
    if wanted and wanted in keys_map:
        out.append(keys_map[wanted])
    for pk in _BOOKMAKER_PRIORITY:
        if pk in keys_map:
            b = keys_map[pk]
            if b not in out:
                out.append(b)
    for b in bookmakers:
        if isinstance(b, dict) and b not in out:
            out.append(b)
    return out


def _merge_raw_odds_maps(
    home: str,
    away: str,
    bookmakers: List[Dict[str, Any]],
) -> Dict[str, float]:
    """
    h2h는 우선 북 1곳, spreads·totals 는 **등록된 모든 북메이커**에서 합집합.
    한 북에만 있는 핸디/언오버 라인까지 살려 플레이어 화면에 최대한 노출한다.
    """
    bm = _pick_bookmaker(bookmakers)
    if bm is None:
        return {}
    raw: Dict[str, float] = {}
    raw.update(_parse_h2h_decimal(home, away, bm))
    for alt in _ordered_bookmakers(bookmakers):
        raw.update(_parse_spreads_decimal(home, away, alt))
        raw.update(_parse_totals_decimal(alt))
    return raw


def _parse_h2h_decimal(
    home_team: str,
    away_team: str,
    bookmaker: Dict[str, Any],
) -> Dict[str, float]:
    """h2h 마켓 → HOME_WIN / DRAW / AWAY_WIN (decimal)."""
    out: Dict[str, float] = {}
    markets = bookmaker.get("markets") or []
    h2h = None
    for m in markets:
        if isinstance(m, dict) and m.get("key") == "h2h":
            h2h = m
            break
    if not h2h:
        return out
    outcomes = h2h.get("outcomes") or []
    hn = (home_team or "").strip().lower()
    an = (away_team or "").strip().lower()
    for o in outcomes:
        if not isinstance(o, dict):
            continue
        name = str(o.get("name", "")).strip()
        price = o.get("price")
        try:
            dec = float(price)
        except (TypeError, ValueError):
            continue
        nl = name.lower()
        if nl == hn:
            out["HOME_WIN"] = dec
        elif nl == an:
            out["AWAY_WIN"] = dec
        elif "draw" in nl or name in ("Draw", "무", "X"):
            out["DRAW"] = dec
    if "DRAW" not in out and len(outcomes) == 3:
        for o in outcomes:
            if not isinstance(o, dict):
                continue
            name = str(o.get("name", "")).strip().lower()
            if name != hn and name != an:
                try:
                    out["DRAW"] = float(o.get("price"))
                except (TypeError, ValueError):
                    pass
                break
    # 팀명 표기 불일치(약칭 등)로 홈/원정 매칭 실패 시: 2-way 는 API 관례상 [홈, 원정] 순인 경우가 많음
    if len(outcomes) == 2 and "HOME_WIN" not in out and "AWAY_WIN" not in out:
        a, b = outcomes[0], outcomes[1]
        if isinstance(a, dict) and isinstance(b, dict):
            try:
                pa, pb = float(a.get("price")), float(b.get("price"))
                if pa > 1.0 and pb > 1.0:
                    out["HOME_WIN"] = pa
                    out["AWAY_WIN"] = pb
            except (TypeError, ValueError):
                pass
    return out


def _parse_totals_decimal(bookmaker: Dict[str, Any]) -> Dict[str, float]:
    """totals 마켓 → T_O_* / T_U_* (decimal)."""
    out: Dict[str, float] = {}
    for m in bookmaker.get("markets") or []:
        if not isinstance(m, dict) or m.get("key") != "totals":
            continue
        for o in m.get("outcomes") or []:
            if not isinstance(o, dict):
                continue
            name = str(o.get("name", "")).strip().lower()
            price = o.get("price")
            point = o.get("point")
            try:
                dec = float(price)
                line = float(point)
            except (TypeError, ValueError):
                continue
            if dec <= 1.0:
                continue
            if "over" in name:
                out[total_outcome_key("O", line)] = dec
            elif "under" in name:
                out[total_outcome_key("U", line)] = dec
    return out


def _team_names_match(label: str, team_full: str) -> bool:
    """스프레드 outcome 팀명이 이벤트 홈/원정명과 약칭·접미사(FC 등)로 다를 때."""
    a = (label or "").strip().lower()
    b = (team_full or "").strip().lower()
    if not a or not b:
        return False
    if a == b:
        return True
    if len(a) >= 4 and len(b) >= 4 and (a in b or b in a):
        return True
    return False


def _parse_spreads_decimal(
    home_team: str,
    away_team: str,
    bookmaker: Dict[str, Any],
) -> Dict[str, float]:
    """spreads 마켓 → S_H_* / S_A_* (decimal)."""
    out: Dict[str, float] = {}
    hn = (home_team or "").strip().lower()
    an = (away_team or "").strip().lower()
    if not hn or not an:
        return out
    for m in bookmaker.get("markets") or []:
        if not isinstance(m, dict) or m.get("key") != "spreads":
            continue
        for o in m.get("outcomes") or []:
            if not isinstance(o, dict):
                continue
            name = str(o.get("name", "")).strip()
            price = o.get("price")
            point = o.get("point")
            nl = name.strip().lower()
            exact_h = nl == hn
            exact_a = nl == an
            if exact_h:
                pick_home, pick_away = True, False
            elif exact_a:
                pick_home, pick_away = False, True
            else:
                fuzzy_h = _team_names_match(name, home_team)
                fuzzy_a = _team_names_match(name, away_team)
                if fuzzy_h and not fuzzy_a:
                    pick_home, pick_away = True, False
                elif fuzzy_a and not fuzzy_h:
                    pick_home, pick_away = False, True
                else:
                    continue
            try:
                dec = float(price)
                api_point = float(point)
            except (TypeError, ValueError):
                continue
            if dec <= 1.0:
                continue
            key = spread_outcome_key(pick_home, api_point)
            out[key] = dec
    return out


def _friendly_odds_fetch_error(exc: BaseException) -> str:
    """브라우저에 그대로 노출되는 한글 안내 (원문 URL·긴 스택은 숨김)."""
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        if code == 401:
            return (
                "API 인증 실패(401): GAME_PLATFORM_THE_ODDS_API_KEY 가 잘못되었거나 만료·비활성입니다. "
                "the-odds-api.com 대시보드에서 키를 재발급하고, 서버 .env 의 키를 맞춘 뒤 API(8100)를 재시작하세요."
            )
        if code == 403:
            return "API 접근 거부(403): 키 권한·요금제·IP 제한을 확인하세요."
        if code == 429:
            return "API 호출 한도(429): 잠시 후 다시 시도하거나 플랜을 확인하세요."
        if code >= 500:
            return f"The Odds API 서버 오류({code}). 잠시 후 다시 시도하세요."
        return f"API HTTP 오류({code})."
    if isinstance(exc, httpx.RequestError):
        return f"네트워크 오류({type(exc).__name__}): 외부 API에 연결하지 못했습니다."
    msg = str(exc).strip()
    if len(msg) > 420:
        return msg[:420] + "…"
    return msg


def _fetch_sport_odds(client: httpx.Client, sport_key: str) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    base = (settings.THE_ODDS_API_BASE or "https://api.the-odds-api.com").rstrip("/")
    key = (settings.THE_ODDS_API_KEY or "").strip()
    url = f"{base}/v4/sports/{sport_key}/odds"
    params: Dict[str, str] = {
        "apiKey": key,
        "regions": (settings.THE_ODDS_REGIONS or "uk,eu").strip() or "uk,eu",
        "markets": "h2h,spreads,totals",
        "oddsFormat": "decimal",
    }
    bm = (settings.THE_ODDS_BOOKMAKERS or "").strip()
    if bm:
        params["bookmakers"] = bm
    r = client.get(url, params=params, timeout=settings.THE_ODDS_HTTP_TIMEOUT)
    r.raise_for_status()
    global _last_credits_remaining
    cr = r.headers.get("x-requests-remaining")
    if cr is not None:
        _last_credits_remaining = cr
    data = r.json()
    if not isinstance(data, list):
        return [], "response is not a list"
    return data, None


def build_odds_feed() -> Dict[str, Any]:
    key = (settings.THE_ODDS_API_KEY or "").strip()
    if not key:
        raise ValueError("GAME_PLATFORM_THE_ODDS_API_KEY 가 비어 있습니다.")

    margin = float(settings.SPORTS_ODDS_MARGIN_PCT)
    gap = max(0.0, min(2.0, settings.THE_ODDS_REQUEST_GAP_SEC))
    sports_out: List[Dict[str, Any]] = []

    with httpx.Client() as client:
        for idx, (sport_key, label) in enumerate(DEFAULT_SPORT_TARGETS):
            if idx > 0 and gap > 0:
                time.sleep(gap)
            block: Dict[str, Any] = {
                "key": sport_key,
                "label": label,
                "events": [],
                "error": None,
            }
            try:
                try:
                    events, err = _fetch_sport_odds(client, sport_key)
                except httpx.HTTPStatusError as he:
                    if he.response.status_code == 404:
                        alt = _SPORT_KEY_FALLBACK.get(sport_key)
                        if alt:
                            events, err = _fetch_sport_odds(client, alt)
                        else:
                            block["error"] = _friendly_odds_fetch_error(he)
                            sports_out.append(block)
                            continue
                    else:
                        block["error"] = _friendly_odds_fetch_error(he)
                        sports_out.append(block)
                        continue
                if err:
                    block["error"] = err
                    sports_out.append(block)
                    continue
                for ev in events[: settings.THE_ODDS_MAX_EVENTS_PER_SPORT]:
                    if not isinstance(ev, dict):
                        continue
                    bms = ev.get("bookmakers") or []
                    if not isinstance(bms, list):
                        continue
                    bm = _pick_bookmaker(bms)
                    if bm is None:
                        continue
                    home = str(ev.get("home_team", ""))
                    away = str(ev.get("away_team", ""))
                    raw_map = _merge_raw_odds_maps(home, away, bms)
                    adj = {
                        k: _apply_margin_decimal(v, margin) for k, v in raw_map.items()
                    }
                    block["events"].append(
                        {
                            "id": ev.get("id"),
                            "commence_time": ev.get("commence_time"),
                            "home_team": home,
                            "away_team": away,
                            "bookmaker_key": bm.get("key"),
                            "bookmaker_title": bm.get("title"),
                            "raw_odds": {k: round(v, 3) for k, v in raw_map.items()},
                            "adjusted_odds": adj,
                            "margin_pct": margin,
                        }
                    )
            except Exception as e:
                block["error"] = _friendly_odds_fetch_error(e)
            sports_out.append(block)

    return {
        "cached_at": datetime.now(timezone.utc).isoformat(),
        "ttl_sec": int(settings.THE_ODDS_CACHE_TTL_SEC),
        "credits_remaining": _last_credits_remaining,
        "regions": settings.THE_ODDS_REGIONS,
        "margin_pct": margin,
        "sports": sports_out,
    }


def get_cached_odds_feed() -> Dict[str, Any]:
    """스레드 안전 TTL 캐시."""
    now = time.monotonic()
    ttl = max(5, int(settings.THE_ODDS_CACHE_TTL_SEC))
    with _cache_lock:
        global _cache_payload, _cache_expires_monotonic
        if _cache_payload is not None and now < _cache_expires_monotonic:
            p = dict(_cache_payload)
            sports = p.get("sports") or []
            # 전 구간 오류만 담긴 캐시는 버림 → 화면이 '캐시 HIT'에 갇히지 않음
            if sports and all(bool(s.get("error")) for s in sports):
                _cache_payload = None
                _cache_expires_monotonic = 0.0
            else:
                p["served_from_cache"] = True
                return p
    payload = build_odds_feed()
    payload["served_from_cache"] = False
    sports = payload.get("sports") or []
    all_failed = bool(sports) and all(bool(s.get("error")) for s in sports)
    with _cache_lock:
        if not all_failed:
            _cache_payload = payload
            _cache_expires_monotonic = time.monotonic() + ttl
    return payload


def invalidate_odds_feed_cache() -> None:
    """다음 get_cached_odds_feed 호출 시 외부 API를 다시 치도록 캐시 비움."""
    with _cache_lock:
        global _cache_payload, _cache_expires_monotonic
        _cache_payload = None
        _cache_expires_monotonic = 0.0


def fetch_odds_feed_fresh() -> Dict[str, Any]:
    """
    캐시 무시 1회 전체 조회 후 캐시 갱신.
    월 쿼터(무료 플랜) 소모 — 어드민 '경기 동기화' 등에서만 사용.
    """
    invalidate_odds_feed_cache()
    return get_cached_odds_feed()
