"""플레이어(회원) 실시간 알림 — 관리자 쪽지 발송·1:1 문의 답변."""

from __future__ import annotations

from app.websockets.manager import player_ws_manager


async def notify_player_memo(
    user_id: int,
    notification_id: int,
    title: str,
    is_important: bool = False,
) -> None:
    await player_ws_manager.send_to_user(
        user_id,
        "player_notification_new",
        {"id": notification_id, "title": title, "is_important": is_important},
    )


async def notify_player_memos_batch(items: list[tuple[int, int, str, bool]]) -> None:
    for uid, nid, title, imp in items:
        await notify_player_memo(uid, nid, title, imp)


async def notify_support_ticket_replied(user_id: int, ticket_id: int, title: str) -> None:
    await player_ws_manager.send_to_user(
        user_id,
        "support_ticket_replied",
        {"id": ticket_id, "title": title},
    )
