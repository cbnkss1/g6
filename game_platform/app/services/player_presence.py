"""플레이어(회원) 최근 활동 — 메모리 기반. 단일 uvicorn 프로세스 기준."""

from __future__ import annotations

import threading
import time
from typing import Any, Dict, List, Optional, Set

from fastapi import Request

from app.constants import USER_ROLE_PLAYER
from app.models.user import User

_LOCK = threading.Lock()
# user_id -> row
_STORE: Dict[int, Dict[str, Any]] = {}

# 이 시간(초) 안에 heartbeat / API 가 있으면 "접속 중"
ACTIVE_SECONDS = 180


def _client_ip(request: Request) -> str:
    xff = (request.headers.get("x-forwarded-for") or "").strip()
    if xff:
        return xff.split(",")[0].strip()[:64]
    if request.client:
        return (request.client.host or "")[:64]
    return ""


def touch_player_presence(request: Request, user: User) -> None:
    """플레이어 JWT로 인증된 요청마다 호출."""
    if user.role != USER_ROLE_PLAYER:
        return
    now = time.time()
    row = {
        "user_id": user.id,
        "login_id": user.login_id,
        "display_name": user.display_name,
        "site_id": str(user.site_id),
        "client_ip": _client_ip(request),
        "last_seen": now,
    }
    with _LOCK:
        _STORE[user.id] = row


def list_player_presence_rows(
    *,
    super_admin: bool,
    site_id: Optional[str],
    allowed_user_ids: Optional[Set[int]],
) -> List[Dict[str, Any]]:
    """관리자 화면용: 접속 중(최근 ACTIVE_SECONDS 이내 활동) 플레이어 목록."""
    now = time.time()
    cutoff = now - ACTIVE_SECONDS
    with _LOCK:
        rows: List[Dict[str, Any]] = []
        for uid, r in list(_STORE.items()):
            if r.get("last_seen", 0) < cutoff:
                continue
            if not super_admin:
                if allowed_user_ids is not None and uid not in allowed_user_ids:
                    continue
                if site_id and str(r.get("site_id")) != str(site_id):
                    continue
            rows.append(
                {
                    "user_id": int(r["user_id"]),
                    "login_id": str(r["login_id"]),
                    "display_name": r.get("display_name"),
                    "site_id": str(r.get("site_id", "")),
                    "client_ip": str(r.get("client_ip", "")),
                    "last_seen_epoch": float(r["last_seen"]),
                    "idle_seconds": int(now - float(r["last_seen"])),
                }
            )
        rows.sort(key=lambda x: x["last_seen_epoch"], reverse=True)
        return rows


def prune_stale_entries() -> None:
    """가끔 호출해 메모리 정리(선택)."""
    now = time.time()
    cutoff = now - ACTIVE_SECONDS * 2
    with _LOCK:
        dead = [k for k, v in _STORE.items() if v.get("last_seen", 0) < cutoff]
        for k in dead:
            del _STORE[k]
