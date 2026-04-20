#!/usr/bin/env python3
"""
개발/스테이징용: 통합 배팅 로그·파워볼·스포츠 배팅·롤링P 원장·정산 스냅샷·배팅성 게임머니 원장을 비우고
gp_users.rolling_point_balance 를 0으로, game_money_balance 는 남은 gp_game_money_ledger 합으로 맞춤.

주의: 프로덕션에서 실행 금지. 실행: python scripts/reset_betting_rolling_data.py --i-know-this-deletes-data
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import create_engine, text  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models.enums import GameMoneyLedgerReason  # noqa: E402

DELETE_GM_REASONS = tuple(
    sorted(
        {
            GameMoneyLedgerReason.BET_STAKE.value,
            GameMoneyLedgerReason.BET_WIN.value,
            GameMoneyLedgerReason.POWERBALL_STAKE.value,
            GameMoneyLedgerReason.POWERBALL_WIN.value,
        }
    )
)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--i-know-this-deletes-data",
        action="store_true",
        help="이 플래그 없이는 실행되지 않습니다.",
    )
    args = p.parse_args()
    if not args.i_know_this_deletes_data:
        print("거절: --i-know-this-deletes-data 가 필요합니다.")
        sys.exit(1)

    engine = create_engine(settings.DATABASE_URL)
    stmts = [
        "DELETE FROM gp_settlement_snapshots",
        "DELETE FROM gp_rolling_point_ledger",
        "DELETE FROM gp_sports_txs",
        "DELETE FROM gp_sports_slips",
        "DELETE FROM gp_sports_bets",
        "DELETE FROM gp_powerball_bets",
        "DELETE FROM gp_bet_history",
        f"DELETE FROM gp_game_money_ledger WHERE reason IN ({','.join(repr(x) for x in DELETE_GM_REASONS)})",
        "UPDATE gp_users SET rolling_point_balance = 0",
        """
        UPDATE gp_users u
        SET game_money_balance = COALESCE(
            (SELECT SUM(g.delta) FROM gp_game_money_ledger g WHERE g.user_id = u.id),
            0
        )
        """,
    ]
    with engine.begin() as conn:
        for sql in stmts:
            r = conn.execute(text(sql))
            print(sql.strip()[:72] + ("..." if len(sql) > 72 else ""), "→", r.rowcount if r.rowcount >= 0 else "ok")

    print("완료: 배팅·롤링·루징 원장 및 스포츠/파워볼 배팅 행 삭제, 롤링P 0, 게임머니=남은 원장 합.")


if __name__ == "__main__":
    main()
