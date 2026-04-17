"""에이전트 API: 추천인 직속 팀 목록, 선불 P2P 지급/회수 (동일 회원 모델)."""
from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth_jwt import get_current_user_from_token
from app.models.user import User
from app.schemas.agent import AgentTransferBody
from app.services.agent_transfer_service import agent_p2p_transfer
from app.services.partner_utils import user_is_partner

router = APIRouter()


@router.get("/downline", summary="직접 추천 직속 팀 1단 목록")
def agent_downline(
    user=Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    rows = db.scalars(
        select(User).where(User.referrer_id == user.id).order_by(User.id)
    ).all()
    items: List[Dict[str, Any]] = []
    for r in rows:
        items.append(
            {
                "id": r.id,
                "login_id": r.login_id,
                "display_name": r.display_name,
                "game_money_balance": str(r.game_money_balance),
                "is_partner": user_is_partner(db, r.id),
            }
        )
    return {
        "my_user_id": user.id,
        "my_game_money_balance": str(user.game_money_balance),
        "is_store_enabled": user.is_store_enabled,
        "is_partner": user_is_partner(db, user.id),
        "items": items,
    }


@router.post("/transfer", summary="매장 선불 지급(pay) / 회수(collect)")
def agent_transfer(
    body: AgentTransferBody,
    user=Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    try:
        out = agent_p2p_transfer(
            db,
            agent=user,
            counterparty_user_id=body.counterparty_user_id,
            amount=Decimal(body.amount),
            direction=body.direction,
        )
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
    return out
