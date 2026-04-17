from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: Optional[str]) -> bool:
    if not hashed:
        return False
    return pwd_context.verify(plain, hashed)


def create_access_token(
    *,
    user_id: int,
    role: str,
    site_id: str,
    expires_minutes: Optional[int] = None,
) -> str:
    exp_m = expires_minutes if expires_minutes is not None else settings.ACCESS_TOKEN_EXPIRE_MINUTES
    now = datetime.now(timezone.utc)
    exp_at = now + timedelta(minutes=exp_m)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role,
        "site_id": site_id,
        "exp": int(exp_at.timestamp()),
        "iat": int(now.timestamp()),
    }
    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> dict[str, Any]:
    # 서버·클라이언트 시계 차이로 곧바로 만료 처리되는 것을 완화
    return jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
        leeway=120,
    )
