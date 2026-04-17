"""어드민 로그인 IP 허용 목록."""
from __future__ import annotations

import ipaddress
import uuid
from typing import Iterable

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.admin_allowed_ip import AdminAllowedIp


def list_patterns_for_site(db: Session, site_id: uuid.UUID) -> list[str]:
    rows = db.scalars(select(AdminAllowedIp.ip_pattern).where(AdminAllowedIp.site_id == site_id)).all()
    return [str(r) for r in rows if r]


def site_has_any_rule(db: Session, site_id: uuid.UUID) -> bool:
    n = db.scalar(select(func.count()).select_from(AdminAllowedIp).where(AdminAllowedIp.site_id == site_id)) or 0
    return int(n) > 0


def client_ip_matches_any(client_ip: str, patterns: Iterable[str]) -> bool:
    raw = (client_ip or "").strip()
    if not raw:
        return False
    try:
        addr = ipaddress.ip_address(raw)
    except ValueError:
        return False
    for pat in patterns:
        p = (pat or "").strip()
        if not p:
            continue
        try:
            if "/" in p:
                if addr in ipaddress.ip_network(p, strict=False):
                    return True
            else:
                if addr == ipaddress.ip_address(p):
                    return True
        except ValueError:
            continue
    return False


def assert_admin_login_ip_allowed(db: Session, *, site_id: uuid.UUID, client_ip: str) -> None:
    """행이 없으면 통과. 있으면 client_ip 가 하나라도 매칭되어야 함."""
    if not site_has_any_rule(db, site_id):
        return
    pats = list_patterns_for_site(db, site_id)
    if client_ip_matches_any(client_ip, pats):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="등록된 허용 IP에서만 어드민 로그인할 수 있습니다.",
    )
