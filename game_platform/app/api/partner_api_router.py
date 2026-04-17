"""에이전트 공개 API: /api/me, /api/agents/tree (동일 회원·추천인 네트워크, 상위 정보 비노출)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth_router import _site_public, _user_public
from app.constants import USER_ROLE_SUPER_ADMIN
from app.core.database import get_db
from app.dependencies.auth_jwt import get_current_user_from_token
from app.dependencies.data_scope import FORBIDDEN_USER_DATA
from app.models.site_config import SiteConfig
from app.models.user import User, UserGameRollingRate
from app.services.downline_subtree import (
    downward_subtree_user_ids,
    downward_subtree_users_for_tree,
    sanitize_tree_nodes_for_partner,
)

router = APIRouter()


@router.get("/me", summary="내 정보 + 내 요율 (상위/upline 필드 없음)")
def api_me(
    user=Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    site = db.get(SiteConfig, user.site_id)
    if site is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Site configuration missing",
        )
    subtree = downward_subtree_user_ids(db, user.id)
    rate_rows = db.scalars(
        select(UserGameRollingRate).where(UserGameRollingRate.user_id == user.id)
    ).all()
    my_rolling_rates: List[Dict[str, str]] = [
        {"game_type": r.game_type, "rate_percent": str(r.rate_percent)} for r in rate_rows
    ]
    return {
        "user": _user_public(db, user).model_dump(),
        "site": _site_public(site).model_dump(),
        "my_rolling_rates": my_rolling_rates,
        "subtree_user_count": len(subtree),
        "downline_user_count": max(0, len(subtree) - 1),
    }


@router.get("/agents/tree", summary="내 조직 하향 트리 (루트는 항상 본인)")
def api_agents_tree(
    user=Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
    root_id: Optional[int] = Query(
        None,
        description="슈퍼관리자만 다른 루트 지정. 일반 파트너는 무시됩니다.",
    ),
) -> Dict[str, Any]:
    super_admin = user.role == USER_ROLE_SUPER_ADMIN
    if super_admin:
        if root_id is None:
            raise HTTPException(
                status_code=400,
                detail="root_id query parameter is required for super admin",
            )
        effective_root = root_id
    else:
        effective_root = user.id
        if root_id is not None and root_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=FORBIDDEN_USER_DATA,
            )

    root = db.get(User, effective_root)
    if root is None:
        raise HTTPException(status_code=404, detail="root user not found")
    if not super_admin and root.site_id != user.site_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=FORBIDDEN_USER_DATA,
        )

    site_key = str(root.site_id)
    raw = downward_subtree_users_for_tree(
        db,
        effective_root,
        site_id_filter=site_key,
        super_admin=super_admin,
    )

    if super_admin:
        nodes: List[Dict[str, Any]] = []
        id_set = {int(r["id"]) for r in raw}
        for r in raw:
            rid = r.get("referrer_id")
            rid_i = int(rid) if rid is not None else None
            pid = rid_i if rid_i is not None and rid_i in id_set else None
            nodes.append(
                {
                    "id": int(r["id"]),
                    "login_id": r["login_id"],
                    "depth": int(r["depth"]),
                    "game_money_balance": r["game_money_balance"],
                    "rolling_point_balance": r["rolling_point_balance"],
                    "referrer_id": rid_i,
                    "parent_id": pid,
                }
            )
    else:
        nodes = sanitize_tree_nodes_for_partner(raw, root_id=effective_root)

    return {
        "root_user_id": effective_root,
        "nodes": nodes,
        "view_as_root": not super_admin or effective_root == user.id,
    }
