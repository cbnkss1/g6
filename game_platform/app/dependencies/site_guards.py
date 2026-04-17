from __future__ import annotations

from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.constants import USER_ROLE_SUPER_ADMIN
from app.core.database import get_db
from app.dependencies.auth_jwt import require_admin_user
from app.models.site_config import SiteConfig


def _get_site_config(db: Session, site_id: UUID):
    return db.get(SiteConfig, site_id)


def require_site_toto_enabled(
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
):
    if user.role == USER_ROLE_SUPER_ADMIN:
        return user
    cfg = _get_site_config(db, user.site_id)
    if cfg is None or not cfg.is_toto_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Toto feature is not enabled for this site",
        )
    return user


def require_site_casino_enabled(
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
):
    if user.role == USER_ROLE_SUPER_ADMIN:
        return user
    cfg = _get_site_config(db, user.site_id)
    if cfg is None or not cfg.is_casino_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Casino feature is not enabled for this site",
        )
    return user


def require_site_powerball_enabled(
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
):
    if user.role == USER_ROLE_SUPER_ADMIN:
        return user
    cfg = _get_site_config(db, user.site_id)
    if cfg is None or not cfg.is_powerball_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Powerball feature is not enabled for this site",
        )
    return user
