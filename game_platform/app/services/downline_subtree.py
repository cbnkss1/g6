"""JWT 기준 하향식(downward-only) 조직 범위: 본인 + 추천 하부만."""
from __future__ import annotations

from typing import FrozenSet, List, Optional, Set

from sqlalchemy import text
from sqlalchemy.orm import Session


def downward_subtree_user_ids(db: Session, root_user_id: int) -> FrozenSet[int]:
    """본인 포함, 재귀는 referrer_id → 하부만 (상위 탐색 없음)."""
    sql = text(
        """
        WITH RECURSIVE sub AS (
            SELECT id FROM gp_users WHERE id = :root_id
            UNION ALL
            SELECT u.id FROM gp_users u
            INNER JOIN sub ON u.referrer_id = sub.id
        )
        SELECT id FROM sub
        """
    )
    rows = db.execute(sql, {"root_id": root_user_id}).mappings().all()
    return frozenset(int(r["id"]) for r in rows)


def downward_subtree_users_for_tree(
    db: Session,
    root_user_id: int,
    *,
    site_id_filter: Optional[str],
    super_admin: bool,
) -> List[dict]:
    """
    트리용 행 목록 (SQL에서 하향만).
    site_id_filter: 비-슈퍼일 때 site 제한용 uuid 문자열.
    """
    sql = text(
        """
        WITH RECURSIVE sub AS (
            SELECT id, login_id, referrer_id,
                   game_money_balance::text AS game_money_balance,
                   rolling_point_balance::text AS rolling_point_balance,
                   0 AS depth
            FROM gp_users
            WHERE id = :root_id
              AND (:super OR site_id = CAST(:site_id AS uuid))
            UNION ALL
            SELECT u.id, u.login_id, u.referrer_id,
                   u.game_money_balance::text,
                   u.rolling_point_balance::text,
                   sub.depth + 1
            FROM gp_users u
            INNER JOIN sub ON u.referrer_id = sub.id
            WHERE :super OR u.site_id = CAST(:site_id AS uuid)
        )
        SELECT id, login_id, referrer_id, game_money_balance, rolling_point_balance, depth
        FROM sub
        ORDER BY depth, id
        """
    )
    rows = db.execute(
        sql,
        {
            "root_id": root_user_id,
            "site_id": site_id_filter or "",
            "super": super_admin,
        },
    ).mappings().all()
    return [dict(r) for r in rows]


def sanitize_tree_nodes_for_partner(
    raw_rows: List[dict],
    *,
    root_id: int,
) -> List[dict]:
    """
    상위(upline) 단서 제거: 루트의 referrer_id는 노출하지 않음.
    parent_id는 동일 응답 트리 내에서만 설정.
    """
    id_set: Set[int] = {int(r["id"]) for r in raw_rows}
    out: List[dict] = []
    for r in raw_rows:
        uid = int(r["id"])
        rid = r.get("referrer_id")
        parent_id = None
        if uid != root_id and rid is not None:
            pr = int(rid)
            if pr in id_set:
                parent_id = pr
        out.append(
            {
                "id": uid,
                "login_id": r["login_id"],
                "depth": int(r["depth"]),
                "game_money_balance": r["game_money_balance"],
                "rolling_point_balance": r["rolling_point_balance"],
                "parent_id": parent_id,
            }
        )
    return out
