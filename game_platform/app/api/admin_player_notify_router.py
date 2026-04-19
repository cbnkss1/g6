"""관리자 → 플레이어 쪽지(알림) 발송."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.constants import USER_ROLE_PLAYER, USER_ROLE_SUPER_ADMIN
from app.core.database import get_db
from app.dependencies.auth_jwt import require_admin_user
from app.dependencies.data_scope import assert_viewer_may_access_target_user
from app.models.player_notification import PlayerNotification
from app.models.user import User

router = APIRouter()


class SendPlayerNotificationBody(BaseModel):
    login_id: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=20000)


class SendBroadcastPlayerNotificationBody(BaseModel):
    """동일 사이트의 모든 플레이어 계정에게 동일 제목·본문으로 일괄 발송."""

    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=20000)
    site_id: Optional[str] = Field(
        None,
        description="총판(super_admin)만 지정 가능. 비우면 본인 소속 사이트.",
    )


@router.post("/player-notifications/send", summary="회원에게 쪽지(알림) 발송")
def admin_send_player_notification(
    body: SendPlayerNotificationBody,
    viewer: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    lid = body.login_id.strip()
    target = db.scalar(select(User).where(User.login_id == lid))
    if target is None:
        raise HTTPException(status_code=404, detail="해당 로그인 ID를 찾을 수 없습니다.")
    if target.role != USER_ROLE_PLAYER:
        raise HTTPException(status_code=400, detail="플레이어 계정만 쪽지를 보낼 수 있습니다.")
    assert_viewer_may_access_target_user(db, viewer, target.id)

    row = PlayerNotification(
        user_id=target.id,
        title=body.title.strip(),
        body=body.body.strip(),
        sender_admin_id=viewer.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "ok": True,
        "id": row.id,
        "user_id": target.id,
        "login_id": target.login_id,
    }


@router.post("/player-notifications/send-broadcast", summary="사이트 전체 플레이어에게 쪽지 일괄 발송")
def admin_send_broadcast_player_notifications(
    body: SendBroadcastPlayerNotificationBody,
    viewer: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if viewer.role == USER_ROLE_SUPER_ADMIN:
        raw = (body.site_id or "").strip()
        if raw:
            try:
                target_site: UUID = UUID(raw)
            except ValueError as e:
                raise HTTPException(status_code=400, detail="site_id 형식이 올바르지 않습니다.") from e
        else:
            target_site = viewer.site_id
    else:
        target_site = viewer.site_id

    id_rows = db.execute(
        select(User.id).where(User.role == USER_ROLE_PLAYER, User.site_id == target_site)
    ).all()
    user_ids = [int(r[0]) for r in id_rows]
    if not user_ids:
        return {"ok": True, "sent": 0, "site_id": str(target_site), "message": "대상 플레이어가 없습니다."}

    batch = [
        PlayerNotification(
            user_id=uid,
            title=body.title.strip(),
            body=body.body.strip(),
            sender_admin_id=viewer.id,
        )
        for uid in user_ids
    ]
    db.add_all(batch)
    db.commit()
    return {"ok": True, "sent": len(batch), "site_id": str(target_site)}


@router.get("/player-notifications/outbox", summary="최근 발송 쪽지(본인이 보낸 것)")
def admin_outbox_player_notifications(
    viewer: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
) -> Dict[str, Any]:
    q = (
        select(PlayerNotification, User.login_id)
        .join(User, User.id == PlayerNotification.user_id)
        .where(PlayerNotification.sender_admin_id == viewer.id)
        .order_by(desc(PlayerNotification.created_at))
        .limit(limit)
    )
    rows = db.execute(q).all()
    items: List[Dict[str, Any]] = []
    for n, login_id in rows:
        items.append(
            {
                "id": n.id,
                "to_login_id": login_id,
                "title": n.title,
                "body_preview": (n.body[:120] + "…") if len(n.body) > 120 else n.body,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
        )
    return {"items": items}
