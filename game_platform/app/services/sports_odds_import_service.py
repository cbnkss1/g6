"""
The Odds API 피드 → gp_sports_matches / gp_sports_odds 동기화.

- external_match_id = The Odds 이벤트 id (문자열)
- 이미 배팅 슬립이 붙은 OPEN 경기는 배당만 바꾸지 않음 (공정성)
- SETTLED/CLOSED/CANCELLED 는 건드리지 않음
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.sports import SportsMatch, SportsOdds, SportsSlip
from app.models.user import User
from app.services.sports_market_codes import is_valid_odds_outcome_key, odds_value_ok


def _sport_key_to_type(sport_key: str) -> str:
    k = (sport_key or "").lower()
    if k.startswith("basketball"):
        return "BASKETBALL"
    if k.startswith("baseball"):
        return "BASEBALL"
    if k.startswith("icehockey"):
        return "ICEHOCKEY"
    if k.startswith("americanfootball"):
        return "AMERICAN_FOOTBALL"
    if k.startswith("tennis"):
        return "TENNIS"
    if k.startswith("soccer") or k.startswith("football"):
        return "SOCCER"
    return "SOCCER"


def _parse_commence_time(raw: Any) -> datetime:
    s = str(raw or "").strip()
    if not s:
        return datetime.now(timezone.utc)
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _slip_count_for_match(db: Session, match_id: int) -> int:
    return int(
        db.scalar(select(func.count()).select_from(SportsSlip).where(SportsSlip.match_id == match_id))
        or 0
    )


def _apply_odds_rows(db: Session, match_id: int, adjusted: Dict[str, Any]) -> None:
    for o in db.scalars(select(SportsOdds).where(SportsOdds.match_id == match_id)).all():
        db.delete(o)
    db.flush()
    if not isinstance(adjusted, dict):
        return
    for outcome, val in adjusted.items():
        oc = str(outcome).upper()
        if not is_valid_odds_outcome_key(oc):
            continue
        try:
            dec = Decimal(str(val))
        except Exception:
            continue
        if not odds_value_ok(dec):
            continue
        db.add(SportsOdds(match_id=match_id, outcome=oc, odds_value=dec))


def sync_matches_from_odds_feed(
    db: Session,
    feed: Dict[str, Any],
    *,
    actor: Optional[User] = None,
) -> Dict[str, Any]:
    """
    feed = get_cached_odds_feed() 또는 fetch_odds_feed_fresh() 결과.
    """
    created = 0
    updated = 0
    skipped_closed = 0
    skipped_has_bets = 0
    errors: List[str] = []

    sports_blocks = feed.get("sports") or []
    if not isinstance(sports_blocks, list):
        return {
            "ok": False,
            "error": "feed.sports 가 없습니다.",
            "created": 0,
            "updated": 0,
            "skipped_closed": 0,
            "skipped_has_bets": 0,
        }

    for block in sports_blocks:
        if not isinstance(block, dict):
            continue
        sport_key = str(block.get("key") or "")
        league_label = str(block.get("label") or sport_key)
        sport_type = _sport_key_to_type(sport_key)
        if block.get("error"):
            errors.append(f"{sport_key}: {block.get('error')}")
            continue

        for ev in block.get("events") or []:
            if not isinstance(ev, dict):
                continue
            ext_id = str(ev.get("id") or "").strip()[:64]
            if not ext_id:
                continue
            home = str(ev.get("home_team") or "").strip()[:128]
            away = str(ev.get("away_team") or "").strip()[:128]
            if not home or not away:
                continue
            match_at = _parse_commence_time(ev.get("commence_time"))
            adj = ev.get("adjusted_odds")
            if not isinstance(adj, dict) or not adj:
                continue

            existing = db.scalars(
                select(SportsMatch).where(SportsMatch.external_match_id == ext_id)
            ).first()

            if existing is None:
                m = SportsMatch(
                    external_match_id=ext_id,
                    sport_type=sport_type,
                    league_name=league_label[:128],
                    home_team=home,
                    away_team=away,
                    match_at=match_at,
                    status="OPEN",
                )
                db.add(m)
                db.flush()
                _apply_odds_rows(db, m.id, adj)
                created += 1
                continue

            if existing.status != "OPEN":
                skipped_closed += 1
                continue

            n_slips = _slip_count_for_match(db, existing.id)
            if n_slips > 0:
                skipped_has_bets += 1
                continue

            existing.home_team = home
            existing.away_team = away
            existing.match_at = match_at
            existing.league_name = league_label[:128]
            existing.sport_type = sport_type
            _apply_odds_rows(db, existing.id, adj)
            updated += 1

    return {
        "ok": True,
        "created": created,
        "updated": updated,
        "skipped_closed": skipped_closed,
        "skipped_has_bets": skipped_has_bets,
        "errors": errors,
        "feed_cached_at": feed.get("cached_at"),
        "feed_served_from_cache": feed.get("served_from_cache"),
    }
