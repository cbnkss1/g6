#!/usr/bin/env python3
"""
최상위 슈퍼 관리자 + 테스트 테넌트(토토 OFF) 시드.

실행 (game_platform 루트):
  pip install -r requirements.txt
  alembic upgrade head
  python scripts/seed_multitenant_admin.py

- 백오피스: superadmin / SuperAdmin#2026  (/admin/login)
- 메인(회원) 사이트: playerdemo / PlayerDemo#2026  (/api/player/login)

환경: `.env` 의 DATABASE_URL (또는 game_platform 설정과 동일)
"""
from __future__ import annotations

import sys
from decimal import Decimal
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from sqlalchemy import select  # noqa: E402

from app.constants import (  # noqa: E402
    DEFAULT_SITE_ID,
    TEST_SITE_NO_TOTO_ID,
    USER_ROLE_OWNER,
    USER_ROLE_PLAYER,
    USER_ROLE_SUPER_ADMIN,
)
from app.core.database import SessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.site_config import SiteConfig  # noqa: E402
from app.models.user import User  # noqa: E402


def main() -> None:
    super_login = "superadmin"
    super_password = "SuperAdmin#2026"
    tenant_login = "tenant_owner"
    tenant_password = "TenantOwner#2026"
    # 메인 사이트(플레이어) 로그인 테스트용 — role=player 만 /api/player/login 허용
    player_demo_login = "playerdemo"
    player_demo_password = "PlayerDemo#2026"

    with SessionLocal() as db:
        # --- 사이트
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
        if db.get(SiteConfig, TEST_SITE_NO_TOTO_ID) is None:
            db.add(
                SiteConfig(
                    site_id=TEST_SITE_NO_TOTO_ID,
                    site_name="분양 테스트 (토토 비활성)",
                    is_casino_enabled=True,
                    is_powerball_enabled=True,
                    is_toto_enabled=False,
                )
            )
        db.commit()

        # --- 슈퍼 관리자 (기본 사이트 소속, role 만 super_admin)
        u = db.scalar(select(User).where(User.login_id == super_login))
        if u is None:
            db.add(
                User(
                    login_id=super_login,
                    display_name="최상위 관리자",
                    site_id=DEFAULT_SITE_ID,
                    role=USER_ROLE_SUPER_ADMIN,
                    hashed_password=hash_password(super_password),
                    referrer_id=None,
                )
            )
            print(f"Created super admin: login_id={super_login!r} password={super_password!r}")
        else:
            u.hashed_password = hash_password(super_password)
            u.role = USER_ROLE_SUPER_ADMIN
            u.site_id = DEFAULT_SITE_ID
            print(f"Updated super admin: login_id={super_login!r} password={super_password!r}")

        # --- 토토 비활성 사이트 업주
        t = db.scalar(select(User).where(User.login_id == tenant_login))
        if t is None:
            db.add(
                User(
                    login_id=tenant_login,
                    display_name="분양 업주(토토OFF)",
                    site_id=TEST_SITE_NO_TOTO_ID,
                    role=USER_ROLE_OWNER,
                    hashed_password=hash_password(tenant_password),
                    referrer_id=None,
                )
            )
            print(f"Created tenant owner: login_id={tenant_login!r} password={tenant_password!r}")
        else:
            t.hashed_password = hash_password(tenant_password)
            t.site_id = TEST_SITE_NO_TOTO_ID
            t.role = USER_ROLE_OWNER
            print(f"Updated tenant owner: login_id={tenant_login!r} password={tenant_password!r}")

        # --- 메인 사이트 회원 로그인용 데모 (role=player)
        pd = db.scalar(select(User).where(User.login_id == player_demo_login))
        if pd is None:
            db.add(
                User(
                    login_id=player_demo_login,
                    display_name="데모 회원",
                    site_id=DEFAULT_SITE_ID,
                    role=USER_ROLE_PLAYER,
                    hashed_password=hash_password(player_demo_password),
                    hashed_withdraw_password=hash_password("111111"),
                    referrer_id=None,
                    game_money_balance=Decimal("1000000"),
                    rolling_point_balance=Decimal("0"),
                )
            )
            print(
                f"Created demo player (메인 사이트): "
                f"login_id={player_demo_login!r} password={player_demo_password!r}"
            )
        else:
            pd.hashed_password = hash_password(player_demo_password)
            pd.hashed_withdraw_password = hash_password("111111")
            pd.role = USER_ROLE_PLAYER
            pd.site_id = DEFAULT_SITE_ID
            pd.is_active = True
            print(
                f"Updated demo player (메인 사이트): "
                f"login_id={player_demo_login!r} password={player_demo_password!r}"
            )

        db.commit()

    print("Done.")
    print(f"  DEFAULT_SITE_ID={DEFAULT_SITE_ID}")
    print(f"  TEST_SITE_NO_TOTO_ID={TEST_SITE_NO_TOTO_ID}")
    print(f"  메인 사이트 로그인: {player_demo_login!r} / {player_demo_password!r}")


if __name__ == "__main__":
    main()
