"""
어드민 전용 WebSocket 브로드캐스트.
정산 커밋 직후에는 API 레이어에서 broadcast_event를 await 호출한다.
(settlement_service는 동기·DB 무결성 전담, I/O는 여기서 처리)
"""
from __future__ import annotations

import json
import logging
from decimal import Decimal
from typing import Any

from fastapi import WebSocket
from starlette.websockets import WebSocketState

logger = logging.getLogger(__name__)


def _json_safe(obj: Any) -> Any:
    if isinstance(obj, Decimal):
        return str(obj)
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_json_safe(v) for v in obj]
    return obj


class AdminWebSocketManager:
    """인증된 어드민 소켓만 유지. 다중 인스턴스(멀티 워커)에서는 Redis pub/sub 등으로 확장 필요."""

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

    def connection_count(self) -> int:
        return len(self._connections)

    async def accept_admin(self, websocket: WebSocket) -> bool:
        await websocket.accept()
        self._connections.add(websocket)
        return True

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)

    async def broadcast_event(self, event_type: str, payload: dict[str, Any]) -> None:
        body = json.dumps(
            {"type": event_type, "payload": _json_safe(payload)},
            ensure_ascii=False,
        )
        stale: list[WebSocket] = []
        for ws in list(self._connections):
            try:
                if ws.client_state != WebSocketState.CONNECTED:
                    stale.append(ws)
                    continue
                await ws.send_text(body)
            except Exception as e:  # noqa: BLE001
                logger.debug("ws send failed: %s", e)
                stale.append(ws)
        for ws in stale:
            self.disconnect(ws)


class PlayerWebSocketManager:
    """플레이어 JWT(user_id)별 WebSocket — 관리자 쪽지·문의 답변 푸시."""

    def __init__(self) -> None:
        self._by_user: dict[int, set[WebSocket]] = {}

    async def accept_player(self, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        if user_id not in self._by_user:
            self._by_user[user_id] = set()
        self._by_user[user_id].add(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        conns = self._by_user.get(user_id)
        if not conns:
            return
        conns.discard(websocket)
        if not conns:
            del self._by_user[user_id]

    async def send_to_user(self, user_id: int, event_type: str, payload: dict[str, Any]) -> None:
        body = json.dumps(
            {"type": event_type, "payload": _json_safe(payload)},
            ensure_ascii=False,
        )
        conns = list(self._by_user.get(user_id, ()))
        stale: list[WebSocket] = []
        for ws in conns:
            try:
                if ws.client_state != WebSocketState.CONNECTED:
                    stale.append(ws)
                    continue
                await ws.send_text(body)
            except Exception as e:  # noqa: BLE001
                logger.debug("player ws send failed: %s", e)
                stale.append(ws)
        for ws in stale:
            self.disconnect(user_id, ws)


admin_ws_manager = AdminWebSocketManager()
player_ws_manager = PlayerWebSocketManager()
