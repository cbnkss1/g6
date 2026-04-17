#!/usr/bin/env python3
"""
플레이어 계정 test / 1234 생성 또는 비밀번호 재설정.

as.slotpass.net(web-public) 로그인은 POST /api/player/login → gp_users.role=player 필요.

실행 (game_platform 루트, .env 로 DB 연결된 상태):

  cd game_platform
  python scripts/seed_player_test_1234.py

다른 아이디/비번:

  python scripts/seed_player_test_1234.py --login myid --password mypass
"""
from __future__ import annotations

import argparse
import sys
from decimal import Decimal
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from sqlalchemy import select  # noqa: E402

from app.constants import DEFAULT_SITE_ID, USER_ROLE_PLAYER  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.site_config import SiteConfig  # noqa: E402
from app.models.user import User  # noqa: E402


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--login", default="test", help="로그인 아이디")
    p.add_argument("--password", default="1234", help="로그인 비밀번호")
    p.add_argument(
        "--withdraw-password",
        default="1234",
        help="출금 비밀번호(플레이어 검증에 쓰이는 경우 대비)",
    )
    p.add_argument(
        "--balance",
        type=str,
        default="1000000",
        help="게임머니 초기 잔액 (문자열 숫자)",
    )
    args = p.parse_args()
    login_id = (args.login or "").strip()
    password = args.password or ""
    if not login_id:
        print("login_id 비어 있음", file=sys.stderr)
        sys.exit(1)
    if not password:
        print("password 비어 있음", file=sys.stderr)
        sys.exit(1)

    try:
        bal = Decimal(str(args.balance))
    except Exception:
        bal = Decimal("1000000")

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
            print(f"Created default SiteConfig {DEFAULT_SITE_ID}")

        u = db.scalar(select(User).where(User.login_id == login_id))
        if u is None:
            db.add(
                User(
                    login_id=login_id,
                    display_name=login_id,
                    site_id=DEFAULT_SITE_ID,
                    role=USER_ROLE_PLAYER,
                    hashed_password=hash_password(password),
                    hashed_withdraw_password=hash_password(
                        (args.withdraw_password or password).strip() or password
                    ),
                    referrer_id=None,
                    game_money_balance=bal,
                    rolling_point_balance=Decimal("0"),
                    is_active=True,
                )
            )
            print(f"Created player: login_id={login_id!r} password={password!r}")
        else:
            u.hashed_password = hash_password(password)
            u.hashed_withdraw_password = hash_password(
                (args.withdraw_password or password).strip() or password
            )
            u.role = USER_ROLE_PLAYER
            u.site_id = DEFAULT_SITE_ID
            u.is_active = True
            if u.game_money_balance == 0 and bal > 0:
                u.game_money_balance = bal
            print(f"Updated player: login_id={login_id!r} password={password!r}")

        db.commit()

    print("Done. web-public 에서 동일 아이디/비번으로 로그인하세요.")


if __name__ == "__main__":
    main()
