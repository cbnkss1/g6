"""입출금·문의 등 어드민 실시간 알림용 브로드캐스트 (BackgroundTasks에서 DB 새 세션 사용)."""

from __future__ import annotations

from app.core.database import SessionLocal
from app.models.support_ticket import SupportTicket
from app.websockets.manager import admin_ws_manager


async def broadcast_support_ticket_new(ticket_id: int) -> None:
    """티켓 생성 직후 슈퍼/어드민 WS 알림 (제목·카테고리 포함)."""
    db = SessionLocal()
    try:
        row = db.get(SupportTicket, ticket_id)
        if row is None:
            return
        await admin_ws_manager.broadcast_event(
            "support_ticket_new",
            {
                "id": row.id,
                "category": row.category,
                "title": row.title,
                "user_id": row.user_id,
                "source": "partner"
                if (row.category or "").upper() == "PARTNER_TO_SUPER"
                else "player",
            },
        )
        await admin_ws_manager.broadcast_event("dashboard_refresh", {})
    finally:
        db.close()
