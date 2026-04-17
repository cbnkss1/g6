"""
토토(스포츠) 외부 API 연동 — 1단계: 설정·연결 확인(probe).

실제 경기/배당 동기화는 공급사 스펙에 맞는 어댑터를 여기에 추가하면 됨.
(현재 gp_sports_* 테이블 + sports_router 수동 등록과 병행 가능)
"""
from __future__ import annotations

from typing import Any, Dict
from urllib.parse import urlparse

from app.core.config import settings
from app.core.http_client import fetch_json_get


def _redacted_target(base_url: str, path: str) -> Dict[str, Any]:
    """로그·API 응답용: 자격 증명 없이 호스트·경로만."""
    base = (base_url or "").strip().rstrip("/")
    p = (path or "").strip()
    if p and not p.startswith("/"):
        p = "/" + p
    full = base + p if base else ""
    parts = urlparse(full)
    return {
        "scheme": parts.scheme or "",
        "host": parts.hostname or "",
        "port": parts.port,
        "path": (parts.path or "")[:120],
    }


def probe_toto_api() -> Dict[str, Any]:
    """
    TOTO_API_BASE_URL + TOTO_PROBE_PATH 로 GET, JSON 여부만 확인.
    공급사 health 가 JSON 이 아니면 ok=False 이지만 connected 는 True 로 둘 수 있음.
    """
    if not settings.TOTO_ENABLED:
        return {
            "ok": False,
            "configured": False,
            "error": "TOTO_ENABLED=false",
            "target": {},
        }
    base = (settings.TOTO_API_BASE_URL or "").strip().rstrip("/")
    if not base:
        return {
            "ok": False,
            "configured": False,
            "error": "TOTO_API_BASE_URL 비어 있음",
            "target": {},
        }
    path = (settings.TOTO_PROBE_PATH or "").strip()
    if not path:
        url = base
    else:
        url = base + (path if path.startswith("/") else "/" + path)

    target = _redacted_target(base, path or "/")
    bearer = (settings.TOTO_BEARER_TOKEN or "").strip() or None
    ok, data_or_err = fetch_json_get(
        url,
        total_timeout=settings.TOTO_HTTP_TIMEOUT,
        connect_timeout=settings.TOTO_CONNECT_TIMEOUT,
        bearer_token=bearer,
        retries=settings.TOTO_HTTP_RETRIES,
    )
    if not ok:
        return {
            "ok": False,
            "configured": True,
            "connected": False,
            "error": str(data_or_err),
            "target": target,
        }
    return {
        "ok": True,
        "configured": True,
        "connected": True,
        "json": True,
        "preview_keys": list(data_or_err.keys())[:24]
        if isinstance(data_or_err, dict)
        else None,
        "target": target,
    }


def game_apis_status_summary() -> Dict[str, Any]:
    """내부 모니터링용: 비밀·전체 URL 미노출."""
    pb_url = (settings.POWERBALL_API_URL or "").strip()
    pb_p = urlparse(pb_url) if pb_url else None
    tb = (settings.TOTO_API_BASE_URL or "").strip().rstrip("/")
    tp = urlparse(tb + "/") if tb else None
    return {
        "powerball": {
            "enabled": bool(settings.POWERBALL_ENABLED),
            "host": pb_p.hostname if pb_p else "",
            "scheme": pb_p.scheme if pb_p else "",
            "game_key": settings.POWERBALL_GAME_KEY,
            "has_bearer": bool((settings.POWERBALL_BEARER_TOKEN or "").strip()),
            "timeout_sec": settings.POWERBALL_HTTP_TIMEOUT,
            "retries": settings.POWERBALL_HTTP_RETRIES,
            "background_poll_interval_sec": int(
                getattr(settings, "POWERBALL_POLL_INTERVAL_SEC", 0) or 0
            ),
        },
        "toto": {
            "enabled": bool(settings.TOTO_ENABLED),
            "host": tp.hostname if tp else "",
            "scheme": tp.scheme if tp else "",
            "probe_path": (settings.TOTO_PROBE_PATH or "")[:80],
            "has_bearer": bool((settings.TOTO_BEARER_TOKEN or "").strip()),
            "timeout_sec": settings.TOTO_HTTP_TIMEOUT,
            "retries": settings.TOTO_HTTP_RETRIES,
        },
        "the_odds_api": {
            "configured": bool((settings.THE_ODDS_API_KEY or "").strip()),
            "base_host": "api.the-odds-api.com",
            "cache_ttl_sec": int(settings.THE_ODDS_CACHE_TTL_SEC),
            "margin_pct": float(settings.SPORTS_ODDS_MARGIN_PCT),
            "admin_feed_path": "/admin/sports/odds-api/feed",
            "admin_sync_path": "/admin/sports/matches/sync-from-odds-api",
            "note": "무료 쿼터 보호: sync 시 force_refresh=false 권장(TTL 캐시로 동기화)",
        },
        # 그누보드 v6 쪽 Plxmed 프록시(이 저장소 루트). game_platform DB/정산과 별도.
        "v6_plxmed_casino": {
            "rest_prefix": "/api/v1/casino",
            "code": "service/casino/, api/v1/routers/casino.py",
            "env_keys": ["PLXMED_SECURITY_KEY", "PLXMED_CLIENT_ID"],
            "upstream_base": "https://bp.plxmed.com/api/v1/plexApi",
        },
        # 운영에서 쓰는 도메인(대화·레포 .env.local 기준). DNS/Nginx는 서버 실설정 따름.
        "documented_public_urls": {
            "player_next_site_url": "https://as.slotpass.net",
            "admin_next_example": "https://test.slotpass.net",
            "game_api_example": "https://test-api.slotpass.net",
            "game_api_local": "http://127.0.0.1:8100",
        },
    }
