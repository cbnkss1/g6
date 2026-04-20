"""플레이어 쪽지(알림) 목록·읽음 — gp_player_notifications."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket
from sqlalchemy import and_, desc, func, select, update
from sqlalchemy.orm import Session

from app.constants import USER_ROLE_PLAYER
from app.core.database import get_db
from app.core.security import decode_access_token
from app.dependencies.auth_jwt import get_current_user_from_token
from app.models.player_notification import PlayerNotification
from app.models.user import User
from app.websockets.manager import player_ws_manager

router = APIRouter()


def _require_player(user: User) -> None:
    if user.role != USER_ROLE_PLAYER:
        raise HTTPException(status_code=403, detail="플레이어 전용입니다.")


@router.get("/notifications", summary="내 쪽지(알림) 목록")
def player_list_notifications(
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=200),
) -> Dict[str, Any]:
    _require_player(user)
    rows = list(
        db.scalars(
            select(PlayerNotification)
            .where(
                PlayerNotification.user_id == user.id,
                PlayerNotification.deleted_at.is_(None),
            )
            .order_by(desc(PlayerNotification.created_at))
            .limit(limit)
        ).all()
    )
    items: List[Dict[str, Any]] = []
    for r in rows:
        items.append(
            {
                "id": r.id,
                "title": r.title,
                "body": r.body,
                "read_at": r.read_at.isoformat() if r.read_at else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "is_important": bool(r.is_important),
            }
        )
    return {"items": items}


@router.get("/notifications/block-status", summary="중요 쪽지 미열람 시 게임 진입 차단용")
def player_notification_block_status(
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    _require_player(user)
    n = int(
        db.scalar(
            select(func.count())
            .select_from(PlayerNotification)
            .where(
                and_(
                    PlayerNotification.user_id == user.id,
                    PlayerNotification.deleted_at.is_(None),
                    PlayerNotification.is_important == True,  # noqa: E712
                    PlayerNotification.read_at.is_(None),
                )
            )
        )
        or 0
    )
    return {"blocked": n > 0, "unread_important_count": n}


@router.post("/notifications/{notification_id}/read", summary="쪽지 읽음 처리")
def player_mark_notification_read(
    notification_id: int,
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    _require_player(user)
    row = db.get(PlayerNotification, notification_id)
    if row is None or row.user_id != user.id or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail="not found")
    row.read_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "id": row.id}


@router.delete("/notifications/{notification_id}", summary="쪽지함에서 삭제(소프트)")
def player_delete_notification(
    notification_id: int,
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    _require_player(user)
    row = db.get(PlayerNotification, notification_id)
    if row is None or row.user_id != user.id or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail="not found")
    row.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "id": row.id}


@router.post("/notifications/delete-all", summary="쪽지함 전체 삭제(소프트)")
def player_delete_all_notifications(
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    _require_player(user)
    now = datetime.now(timezone.utc)
    r = db.execute(
        update(PlayerNotification)
        .where(
            and_(
                PlayerNotification.user_id == user.id,
                PlayerNotification.deleted_at.is_(None),
            )
        )
        .values(deleted_at=now)
    )
    db.commit()
    rc = r.rowcount
    if rc is None or rc < 0:
        rc = 0
    return {"ok": True, "updated": int(rc)}


@router.websocket("/ws")
async def player_realtime_websocket(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
):
    """브라우저: `wss://호스트/gp-api/api/player/ws?token=<JWT>` — 쪽지·문의 답변 푸시."""
    if not token or not token.strip():
        await websocket.close(code=1008)
        return
    try:
        payload = decode_access_token(token.strip())
        uid = int(payload["sub"])
    except Exception:
        await websocket.close(code=1008)
        return
    await player_ws_manager.accept_player(uid, websocket)
    try:
        while True:
            await websocket.receive_text()
    except Exception:
        pass
    finally:
        player_ws_manager.disconnect(uid, websocket)
