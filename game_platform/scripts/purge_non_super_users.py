#!/usr/bin/env python3
"""
슈퍼관리자(super_admin)를 제외한 gp_users 전원 삭제.
연관 테이블은 FK CASCADE / SET NULL 로 함께 정리됩니다.

사용:
  cd /var/www/html/v6/game_platform && ../venv/bin/python scripts/purge_non_super_users.py
  ../venv/bin/python scripts/purge_non_super_users.py --dry-run   # 삭제 없이 대상만 출력
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import text

from app.constants import USER_ROLE_SUPER_ADMIN
from app.core.database import engine


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="실제 DELETE 없이 유지·삭제 대상만 출력",
    )
    args = ap.parse_args()

    with engine.connect() as conn:
        supers = conn.execute(
            text("SELECT id, login_id, role FROM gp_users WHERE role = :r ORDER BY id"),
            {"r": USER_ROLE_SUPER_ADMIN},
        ).fetchall()
        if not supers:
            print("오류: super_admin 계정이 하나도 없습니다. 데이터 손실을 막기 위해 중단합니다.")
            sys.exit(1)

        print("[유지] super_admin 계정:")
        for row in supers:
            print(f"  id={row[0]}  login_id={row[1]}  role={row[2]}")

        others = conn.execute(
            text(
                "SELECT id, login_id, role FROM gp_users WHERE role <> :r ORDER BY id"
            ),
            {"r": USER_ROLE_SUPER_ADMIN},
        ).fetchall()
        print(f"\n[삭제 대상] role != '{USER_ROLE_SUPER_ADMIN}' : {len(others)}명")
        for row in others[:50]:
            print(f"  id={row[0]}  login_id={row[1]}  role={row[2]}")
        if len(others) > 50:
            print(f"  ... 외 {len(others) - 50}명")

    if args.dry_run:
        print("\n--dry-run 이므로 DELETE 를 실행하지 않았습니다.")
        return

    with engine.begin() as conn:
        r = conn.execute(
            text("DELETE FROM gp_users WHERE role <> :r"),
            {"r": USER_ROLE_SUPER_ADMIN},
        )
        deleted = r.rowcount if r.rowcount is not None else -1
    print(f"\n삭제 완료. gp_users 삭제 행 수(대략): {deleted}")


if __name__ == "__main__":
    main()
