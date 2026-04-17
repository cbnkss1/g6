"""
Audit Log 서비스 — 모든 관리자 활동을 INSERT-ONLY로 기록.

사용법:
    AuditService.log(db, actor=current_user, action="MONEY_EDIT",
                     target_type="USER", target_id=str(user_id),
                     before={"balance": old_val}, after={"balance": new_val})
"""
from __future__ import annotations

import json
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.user import User


class AuditService:
    @staticmethod
    def log(
        db: Session,
        *,
        actor: Optional[User],
        action: str,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        before: Optional[Dict[str, Any]] = None,
        after: Optional[Dict[str, Any]] = None,
        note: Optional[str] = None,
        actor_ip: Optional[str] = None,
    ) -> AuditLog:
        entry = AuditLog(
            actor_user_id=actor.id if actor else None,
            actor_login_id=actor.login_id if actor else None,
            actor_role=actor.role if actor else None,
            actor_ip=actor_ip,
            action=action,
            target_type=target_type,
            target_id=target_id,
            before_json=json.dumps(before, ensure_ascii=False, default=str) if before else None,
            after_json=json.dumps(after, ensure_ascii=False, default=str) if after else None,
            note=note,
        )
        db.add(entry)
        return entry
