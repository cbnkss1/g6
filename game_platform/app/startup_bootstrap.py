"""선택적 기동 시 플레이어 계정 보장 (GAME_PLATFORM_BOOTSTRAP_PLAYERS)."""
from __future__ import annotations

import logging
from decimal import Decimal

from sqlalchemy import select

from app.constants import DEFAULT_SITE_ID, USER_ROLE_PLAYER
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.site_config import SiteConfig
from app.models.user import User

log = logging.getLogger(__name__)

_DEFAULT_BALANCE = Decimal("1000000")


def run_bootstrap_players() -> None:
    raw = (settings.BOOTSTRAP_PLAYERS or "").strip()
    if not raw:
        return

    pairs: list[tuple[str, str]] = []
    for part in raw.split(","):
        p = part.strip()
        if not p:
            continue
        if ":" not in p:
            log.warning("BOOTSTRAP_PLAYERS skip (no ':'): %r", p)
            continue
        login_id, password = p.split(":", 1)
        login_id = login_id.strip()
        password = password.strip()
        if not login_id or not password:
            log.warning("BOOTSTRAP_PLAYERS skip (empty login/password): %r", p)
            continue
        pairs.append((login_id, password))

    if not pairs:
        return

    with SessionLocal() as db:
        if db.get(SiteConfig, DEFAULT_SITE_ID) is None:
            db.add(
                SiteConfig(
                    site_id=DEFAULT_SITE_ID,
                    site_name="플랫폼 기본 (전 기능)",
                    is_casino_enabled=True,
                    is_powerball_enabled=True,
                    is_toto_enabled=True,
                )
            )
            db.commit()
            log.warning("BOOTSTRAP_PLAYERS: created default SiteConfig")

        for login_id, password in pairs:
            u = db.scalar(select(User).where(User.login_id == login_id))
            if u is None:
                db.add(
                    User(
                        login_id=login_id,
                        display_name=login_id,
                        site_id=DEFAULT_SITE_ID,
                        role=USER_ROLE_PLAYER,
                        hashed_password=hash_password(password),
                        hashed_withdraw_password=hash_password(password),
                        referrer_id=None,
                        game_money_balance=_DEFAULT_BALANCE,
                        rolling_point_balance=Decimal("0"),
                        is_active=True,
                    )
                )
                log.warning("BOOTSTRAP_PLAYERS: created player %r", login_id)
            else:
                u.hashed_password = hash_password(password)
                u.hashed_withdraw_password = hash_password(password)
                u.role = USER_ROLE_PLAYER
                u.site_id = DEFAULT_SITE_ID
                u.is_active = True
                log.warning("BOOTSTRAP_PLAYERS: updated player %r", login_id)

        db.commit()
