"""플레이어 1:1 문의 (티켓 작성·목록·배팅 첨부용 최근 내역)."""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, desc, select
from sqlalchemy.orm import Session

from app.constants import USER_ROLE_PLAYER
from app.core.database import get_db
from app.dependencies.auth_jwt import get_current_user_from_token
from app.models.bet import BetHistory
from app.models.support_ticket import SupportTicket
from app.models.user import User
from app.websockets.manager import admin_ws_manager
from app.websockets.ops_events import broadcast_support_ticket_new

router = APIRouter()


async def _broadcast_support_dashboard_refresh() -> None:
    await admin_ws_manager.broadcast_event("dashboard_refresh", {})


SUPPORT_CATEGORY_KEYS = frozenset(
    {"CHARGE", "WITHDRAW", "GAME_VOID", "EVENT", "OTHER"}
)


class SupportTicketCreateBody(BaseModel):
    category: str = Field(..., min_length=2, max_length=32)
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=20000)
    attached_bet_ids: List[int] = Field(default_factory=list, max_length=20)


def _require_player(user: User) -> None:
    if user.role != USER_ROLE_PLAYER:
        raise HTTPException(status_code=403, detail="플레이어 전용입니다.")


@router.get("/support/bets/recent", summary="내 배팅 내역 (문의 첨부용)")
def player_recent_bets_for_support(
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
    limit: int = Query(30, ge=1, le=100),
) -> Dict[str, Any]:
    _require_player(user)
    rows = list(
        db.scalars(
            select(BetHistory)
            .where(BetHistory.user_id == user.id)
            .order_by(desc(BetHistory.created_at))
            .limit(limit)
        ).all()
    )
    return {
        "items": [
            {
                "id": r.id,
                "external_bet_uid": r.external_bet_uid,
                "game_type": r.game_type,
                "bet_amount": str(r.bet_amount),
                "win_amount": str(r.win_amount) if r.win_amount is not None else None,
                "status": r.status,
                "game_result": r.game_result,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "link_line": f"배팅 ID #{r.id} ({r.external_bet_uid})",
            }
            for r in rows
        ]
    }


@router.get("/support/tickets", summary="내 1:1 문의 목록")
def player_list_support_tickets(
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
    limit: int = Query(40, ge=1, le=100),
) -> Dict[str, Any]:
    _require_player(user)
    rows = list(
        db.scalars(
            select(SupportTicket)
            .where(SupportTicket.user_id == user.id)
            .order_by(desc(SupportTicket.created_at))
            .limit(limit)
        ).all()
    )
    return {
        "items": [_ticket_public(r) for r in rows],
    }


@router.delete("/support/tickets/{ticket_id}", summary="내 1:1 문의 삭제 (본인)")
async def player_delete_support_ticket(
    ticket_id: int,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    _require_player(user)
    row = db.get(SupportTicket, ticket_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="문의를 찾을 수 없습니다.")
    db.delete(row)
    db.commit()
    background_tasks.add_task(_broadcast_support_dashboard_refresh)
    return {"ok": True, "deleted_id": ticket_id}


@router.post("/support/tickets/delete-all", summary="내 1:1 문의 전체 삭제")
async def player_delete_all_support_tickets(
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    _require_player(user)
    res = db.execute(delete(SupportTicket).where(SupportTicket.user_id == user.id))
    db.commit()
    n = int(res.rowcount or 0)
    background_tasks.add_task(_broadcast_support_dashboard_refresh)
    return {"ok": True, "deleted_count": n}


@router.post("/support/tickets", summary="1:1 문의 작성", status_code=201)
def player_create_support_ticket(
    body: SupportTicketCreateBody,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    _require_player(user)
    if not user.is_active:
        raise HTTPException(status_code=403, detail="비활성화된 계정입니다.")

    cat = body.category.strip().upper()
    if cat not in SUPPORT_CATEGORY_KEYS:
        raise HTTPException(status_code=400, detail="유효하지 않은 문의 카테고리입니다.")

    raw_ids = list(dict.fromkeys(body.attached_bet_ids))[:20]
    if raw_ids:
        bets = list(
            db.scalars(
                select(BetHistory).where(
                    BetHistory.id.in_(raw_ids),
                    BetHistory.user_id == user.id,
                )
            ).all()
        )
        found = {b.id for b in bets}
        missing = [i for i in raw_ids if i not in found]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"첨부할 수 없는 배팅 ID: {missing}",
            )

    sid = str(user.site_id)
    row = SupportTicket(
        user_id=user.id,
        site_id=sid,
        category=cat,
        title=body.title.strip(),
        body=body.body.strip(),
        attached_bet_ids=raw_ids or None,
        status="OPEN",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    background_tasks.add_task(broadcast_support_ticket_new, row.id)
    return _ticket_public(row)


def _ticket_public(r: SupportTicket) -> Dict[str, Any]:
    return {
        "id": r.id,
        "category": r.category,
        "title": r.title,
        "body": r.body,
        "attached_bet_ids": r.attached_bet_ids or [],
        "status": r.status,
        "admin_reply": r.admin_reply,
        "replied_at": r.replied_at.isoformat() if r.replied_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }
