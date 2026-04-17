"""하향식 데이터 접근: 상위·타 조직 ID 조작 시 403."""
from __future__ import annotations

from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.constants import USER_ROLE_SUPER_ADMIN
from app.models.user import User
from app.services.downline_subtree import downward_subtree_user_ids

FORBIDDEN_USER_DATA = "권한이 없는 유저 데이터입니다"


def assert_viewer_may_access_target_user(
    db: Session,
    viewer: User,
    target_user_id: int,
) -> None:
    """비-슈퍼: target은 반드시 본인 또는 본인의 하향 트리 안."""
    if viewer.role == USER_ROLE_SUPER_ADMIN:
        return
    allowed = downward_subtree_user_ids(db, viewer.id)
    if target_user_id not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=FORBIDDEN_USER_DATA,
        )


def downward_subtree_user_ids_for_scope(db: Session, user_id: int) -> List[int]:
    """비-슈퍼 관리자의 하향 트리 user_id 목록 (본인 포함)."""
    return downward_subtree_user_ids(db, user_id)
