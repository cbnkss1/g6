"""어드민 API/WebSocket 인증 (토큰 기반 스텁 → JWT로 확장 가능)."""
from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db

_bearer = HTTPBearer(auto_error=False)


def _token_ok(token: Optional[str]) -> bool:
    expected = (settings.ADMIN_API_TOKEN or "").strip()
    if not expected:
        return False
    return bool(token and token.strip() == expected)


async def require_admin_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> str:
    token = credentials.credentials if credentials else None
    if not _token_ok(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token


def require_admin_db(
    _admin: str = Depends(require_admin_token),
    db: Session = Depends(get_db),
) -> Session:
    return db
