"""플레이어 쪽지(알림) 목록·읽음 — gp_player_notifications."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.constants import USER_ROLE_PLAYER
from app.core.database import get_db
from app.dependencies.auth_jwt import get_current_user_from_token
from app.models.player_notification import PlayerNotification
from app.models.user import User

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
            .where(PlayerNotification.user_id == user.id)
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
            }
        )
    return {"items": items}


@router.post("/notifications/{notification_id}/read", summary="쪽지 읽음 처리")
def player_mark_notification_read(
    notification_id: int,
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    _require_player(user)
    row = db.get(PlayerNotification, notification_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="not found")
    row.read_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "id": row.id}
