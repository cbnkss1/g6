"""관리자 1:1 문의 티켓 처리."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.constants import USER_ROLE_SUPER_ADMIN
from app.core.database import get_db
from app.dependencies.auth_jwt import require_admin_user
from app.dependencies.data_scope import assert_viewer_may_access_target_user, downward_subtree_user_ids_for_scope
from app.models.support_ticket import SupportTicket
from app.models.user import User
from app.services.support_user_summary import build_support_user_summary
from app.websockets.manager import admin_ws_manager

router = APIRouter()


async def _broadcast_support_dashboard_refresh() -> None:
    await admin_ws_manager.broadcast_event("dashboard_refresh", {})


class SupportTicketReplyBody(BaseModel):
    admin_reply: str = Field(..., min_length=1, max_length=20000)
    status: str = Field(default="ANSWERED", max_length=16)


def _ticket_scope_user_ids(db: Session, viewer: User) -> Optional[List[int]]:
    if viewer.role == USER_ROLE_SUPER_ADMIN:
        return None
    return list(downward_subtree_user_ids_for_scope(db, viewer.id))


@router.get("/support/tickets", summary="1:1 문의 목록")
def admin_list_support_tickets(
    viewer: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    filters = []
    if status_filter and status_filter.strip():
        filters.append(SupportTicket.status == status_filter.strip().upper())
    scope = _ticket_scope_user_ids(db, viewer)
    if scope is not None:
        if not scope:
            return {"items": [], "total": 0, "limit": limit, "offset": offset}
        filters.append(SupportTicket.user_id.in_(scope))

    base = select(SupportTicket)
    count_stmt = select(func.count()).select_from(SupportTicket)
    for f in filters:
        base = base.where(f)
        count_stmt = count_stmt.where(f)

    total = int(db.scalar(count_stmt) or 0)
    rows = list(
        db.scalars(base.order_by(desc(SupportTicket.created_at)).offset(offset).limit(limit)).all()
    )
    return {
        "items": [_admin_list_row(db, r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def _admin_list_row(db: Session, r: SupportTicket) -> Dict[str, Any]:
    u = db.get(User, r.user_id)
    login = u.login_id if u else "?"
    return {
        "id": r.id,
        "user_id": r.user_id,
        "user_login_id": login,
        "site_id": r.site_id,
        "category": r.category,
        "title": r.title,
        "status": r.status,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "has_reply": bool(r.admin_reply and r.admin_reply.strip()),
    }


@router.get("/support/tickets/{ticket_id}", summary="1:1 문의 상세 + 유저 요약")
def admin_get_support_ticket(
    ticket_id: int,
    viewer: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    row = db.get(SupportTicket, ticket_id)
    if row is None:
        raise HTTPException(status_code=404, detail="ticket not found")
    assert_viewer_may_access_target_user(db, viewer, row.user_id)

    u = db.get(User, row.user_id)
    if u is None:
        raise HTTPException(status_code=404, detail="user missing")

    summary = build_support_user_summary(db, row.user_id)

    return {
        "ticket": {
            "id": row.id,
            "user_id": row.user_id,
            "site_id": row.site_id,
            "category": row.category,
            "title": row.title,
            "body": row.body,
            "attached_bet_ids": row.attached_bet_ids or [],
            "status": row.status,
            "admin_reply": row.admin_reply,
            "replied_at": row.replied_at.isoformat() if row.replied_at else None,
            "replied_by_id": row.replied_by_id,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        },
        "user": {
            "id": u.id,
            "login_id": u.login_id,
            "display_name": u.display_name,
        },
        "user_summary": {
            "registered_at": summary.registered_at,
            "member_level": summary.member_level,
            "total_deposit_approved": str(summary.total_deposit_approved),
            "total_withdraw_approved": str(summary.total_withdraw_approved),
            "bad_actor": summary.bad_actor,
            "game_money_balance": str(summary.game_money_balance),
        },
    }


@router.patch("/support/tickets/{ticket_id}", summary="1:1 문의 답변 등록")
def admin_reply_support_ticket(
    ticket_id: int,
    body: SupportTicketReplyBody,
    background_tasks: BackgroundTasks,
    viewer: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    row = db.get(SupportTicket, ticket_id)
    if row is None:
        raise HTTPException(status_code=404, detail="ticket not found")
    assert_viewer_may_access_target_user(db, viewer, row.user_id)

    st = body.status.strip().upper()
    if st not in ("ANSWERED", "CLOSED", "OPEN"):
        raise HTTPException(status_code=400, detail="status 는 ANSWERED, CLOSED, OPEN 중 하나입니다.")

    row.admin_reply = body.admin_reply.strip()
    row.replied_by_id = viewer.id
    now = datetime.now(timezone.utc)
    row.replied_at = now
    row.updated_at = now
    row.status = st
    db.commit()
    db.refresh(row)
    background_tasks.add_task(_broadcast_support_dashboard_refresh)
    return {"ok": True, "ticket_id": row.id, "status": row.status}
