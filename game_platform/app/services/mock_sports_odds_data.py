"""시연용 고정 시드 축구 경기 목록 (HTTPS 더미 로고 + 초기 1X2 배당)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List


def _logo(seed: str) -> str:
    """고정 시드로 항상 같은 이미지가 나오는 무료 더미(시연 안정). TheSportsDB로 바꿀 때는 URL만 교체."""
    return f"https://picsum.photos/seed/{seed}/96/96.webp"


def build_initial_matches() -> List[Dict[str, Any]]:
    """match_id, 팀명, 로고, match_time(ISO), status, 초기 승무패 배당."""
    now = datetime.now(timezone.utc)
    rows: List[Dict[str, Any]] = [
        {
            "match_id": 900001,
            "league": "Premier League",
            "home_team": "Manchester United",
            "away_team": "Liverpool",
            "home_logo_url": _logo("mock-epl-mu"),
            "away_logo_url": _logo("mock-epl-liv"),
            "match_time": (now + timedelta(hours=1)).isoformat(),
            "status": "LIVE",
            "odds_home": 2.45,
            "odds_draw": 3.35,
            "odds_away": 2.95,
        },
        {
            "match_id": 900002,
            "league": "La Liga",
            "home_team": "Real Madrid",
            "away_team": "Barcelona",
            "home_logo_url": _logo("mock-laliga-rm"),
            "away_logo_url": _logo("mock-laliga-fcb"),
            "match_time": (now + timedelta(minutes=45)).isoformat(),
            "status": "LIVE",
            "odds_home": 2.10,
            "odds_draw": 3.50,
            "odds_away": 3.40,
        },
        {
            "match_id": 900003,
            "league": "Serie A",
            "home_team": "Inter Milan",
            "away_team": "AC Milan",
            "home_logo_url": _logo("mock-seriea-int"),
            "away_logo_url": _logo("mock-seriea-mil"),
            "match_time": (now + timedelta(minutes=20)).isoformat(),
            "status": "LIVE",
            "odds_home": 2.25,
            "odds_draw": 3.15,
            "odds_away": 3.25,
        },
        {
            "match_id": 900004,
            "league": "Bundesliga",
            "home_team": "Bayern Munich",
            "away_team": "Borussia Dortmund",
            "home_logo_url": _logo("mock-bun-fcbay"),
            "away_logo_url": _logo("mock-bun-bvb"),
            "match_time": (now + timedelta(hours=2)).isoformat(),
            "status": "LIVE",
            "odds_home": 1.75,
            "odds_draw": 4.10,
            "odds_away": 4.25,
        },
        {
            "match_id": 900005,
            "league": "Ligue 1",
            "home_team": "Paris SG",
            "away_team": "Olympique Marseille",
            "home_logo_url": _logo("mock-l1-psg"),
            "away_logo_url": _logo("mock-l1-om"),
            "match_time": (now + timedelta(hours=3)).isoformat(),
            "status": "LIVE",
            "odds_home": 1.55,
            "odds_draw": 4.40,
            "odds_away": 5.20,
        },
        {
            "match_id": 900006,
            "league": "Eredivisie",
            "home_team": "Ajax",
            "away_team": "PSV Eindhoven",
            "home_logo_url": _logo("mock-ered-aja"),
            "away_logo_url": _logo("mock-ered-psv"),
            "match_time": (now + timedelta(hours=4)).isoformat(),
            "status": "LIVE",
            "odds_home": 2.05,
            "odds_draw": 3.60,
            "odds_away": 3.30,
        },
        {
            "match_id": 900007,
            "league": "Primeira Liga",
            "home_team": "Benfica",
            "away_team": "Porto",
            "home_logo_url": _logo("mock-pl-ben"),
            "away_logo_url": _logo("mock-pl-por"),
            "match_time": (now + timedelta(hours=5)).isoformat(),
            "status": "LIVE",
            "odds_home": 2.30,
            "odds_draw": 3.25,
            "odds_away": 3.10,
        },
        {
            "match_id": 900008,
            "league": "K League 1",
            "home_team": "Ulsan HD",
            "away_team": "Jeonbuk Motors",
            "home_logo_url": _logo("mock-kl1-uls"),
            "away_logo_url": _logo("mock-kl1-jb"),
            "match_time": (now + timedelta(hours=6)).isoformat(),
            "status": "LIVE",
            "odds_home": 2.15,
            "odds_draw": 3.20,
            "odds_away": 3.45,
        },
        {
            "match_id": 900009,
            "league": "NBA",
            "home_team": "Los Angeles Lakers",
            "away_team": "Boston Celtics",
            "home_logo_url": _logo("mock-nba-lal"),
            "away_logo_url": _logo("mock-nba-bos"),
            "match_time": (now + timedelta(hours=2)).isoformat(),
            "status": "LIVE",
            "odds_home": 1.92,
            "odds_draw": 15.0,
            "odds_away": 2.05,
        },
        {
            "match_id": 900010,
            "league": "LCK",
            "home_team": "T1",
            "away_team": "Gen.G",
            "home_logo_url": _logo("mock-lck-t1"),
            "away_logo_url": _logo("mock-lck-gen"),
            "match_time": (now + timedelta(hours=1)).isoformat(),
            "status": "LIVE",
            "odds_home": 1.78,
            "odds_draw": 4.2,
            "odds_away": 3.55,
        },
    ]
    return rows
