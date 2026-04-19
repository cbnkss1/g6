"""파트너 판별: 역할(player/owner 등)과 무관하게 요율만 본다.

`UserGameRollingRate` 중 **0.00001% 이상**인 행이 하나라도 있으면 파트너.
(극미만 양수만 인정 — 0 또는 그 미만 먼지는 파트너 아님.)
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.constants import ADMIN_ROLES, USER_ROLE_PLAYER
from app.models.user import User, UserGameRollingRate

# 이 값 이상이면 파트너로 간주 (비즈니스: “0.00001%라도 있으면”)
MIN_PARTNER_ROLLING_PERCENT = Decimal("0.00001")


def user_has_admin_tree_access(db: Session, user: User) -> bool:
    """
    어드민 JWT·REST·WS 허용 여부.
    슈퍼/총판/스태프 또는, 롤링 요율이 있는 플레이어(하부 파트너)만 True.
    """
    if user.role in ADMIN_ROLES:
        return True
    if user.role == USER_ROLE_PLAYER:
        return user_is_partner(db, user.id)
    return False


def user_is_partner(db: Session, user_id: int) -> bool:
    n = db.scalar(
        select(func.count())
        .select_from(UserGameRollingRate)
        .where(
            UserGameRollingRate.user_id == user_id,
            UserGameRollingRate.rolling_rate_percent >= MIN_PARTNER_ROLLING_PERCENT,
        )
    )
    return int(n or 0) > 0


def rolling_rate_qualifies_for_upline(rate: Any) -> bool:
    """
    추천인 롤링·정산 스냅샷에 반영할 만큼의 요율인지.
    `user_is_partner` 와 동일 임계값 — 역할과 무관, 수치만 본다.
    """
    try:
        d = Decimal(str(rate))
    except Exception:
        return False
    return d >= MIN_PARTNER_ROLLING_PERCENT
