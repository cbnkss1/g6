"""플레이어 본인 게임머니·롤링 원장 조회."""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.constants import USER_ROLE_PLAYER
from app.core.database import get_db
from app.dependencies.auth_jwt import get_current_user_from_token
from app.models.ledger import GameMoneyLedgerEntry, RollingPointLedgerEntry
from app.models.user import User
from app.services.ledger_labels import label_game_money_reason, label_rolling_reason

router = APIRouter()


def _require_player(user: User) -> None:
    if user.role != USER_ROLE_PLAYER:
        raise HTTPException(status_code=403, detail="플레이어 전용입니다.")


@router.get("/ledger/game-money", summary="내 게임머니 원장")
def player_ledger_game_money(
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
    limit: int = Query(40, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    _require_player(user)
    rows = list(
        db.scalars(
            select(GameMoneyLedgerEntry)
            .where(GameMoneyLedgerEntry.user_id == user.id)
            .order_by(desc(GameMoneyLedgerEntry.id))
            .offset(offset)
            .limit(limit)
        ).all()
    )
    items: List[Dict[str, Any]] = []
    for ent in rows:
        items.append(
            {
                "id": ent.id,
                "delta": str(ent.delta),
                "balance_after": str(ent.balance_after),
                "reason_label": label_game_money_reason(ent.reason),
                "created_at": ent.created_at.isoformat() if ent.created_at else None,
            }
        )
    return {"items": items, "limit": limit, "offset": offset}


@router.get("/ledger/rolling-point", summary="내 롤링 포인트 원장")
def player_ledger_rolling_point(
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
    limit: int = Query(40, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    _require_player(user)
    rows = list(
        db.scalars(
            select(RollingPointLedgerEntry)
            .where(RollingPointLedgerEntry.user_id == user.id)
            .order_by(desc(RollingPointLedgerEntry.id))
            .offset(offset)
            .limit(limit)
        ).all()
    )
    items: List[Dict[str, Any]] = []
    for ent in rows:
        items.append(
            {
                "id": ent.id,
                "delta": str(ent.delta),
                "balance_after": str(ent.balance_after),
                "reason_label": label_rolling_reason(ent.reason),
                "created_at": ent.created_at.isoformat() if ent.created_at else None,
            }
        )
    return {"items": items, "limit": limit, "offset": offset}
