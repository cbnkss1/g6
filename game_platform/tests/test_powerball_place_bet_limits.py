"""파워볼 place_powerball_bet — effective_limits 기준 min/max 검증 (모의 DB)."""

from __future__ import annotations

import unittest
import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch

from app.models.powerball import PowerballBet
from app.services.powerball_service import (
    default_powerball_odds_map,
    place_powerball_bet,
)


class _FakeUser:
    __tablename__ = "gp_users"

    def __init__(self) -> None:
        self.id = 1
        self.site_id = uuid.uuid4()
        self.game_money_balance = Decimal("100000")
        self.bet_limits_override = None


class TestPlacePowerballBetPowerballLimits(unittest.TestCase):
    """요청: 자동 테스트는 파워볼 배팅 한도 검증에 집중."""

    def setUp(self) -> None:
        self.user = _FakeUser()
        self.db = MagicMock()

    def _wire_db(self) -> None:
        r = MagicMock()
        r.one_or_none.return_value = self.user
        self.db.scalars.return_value = r
        self.db.get.return_value = MagicMock()

        def flush() -> None:
            for call in self.db.add.call_args_list:
                if not call[0]:
                    continue
                obj = call[0][0]
                if isinstance(obj, PowerballBet):
                    object.__setattr__(obj, "id", 90001)

        self.db.flush.side_effect = flush

    @patch("app.services.powerball_service.configured_powerball_game_keys", return_value=["coinpowerball3"])
    @patch("app.services.powerball_service.effective_limits")
    def test_powerball_rejects_below_min(self, mock_el, _mock_keys) -> None:
        mock_el.return_value = (Decimal("100"), Decimal("999999"))
        self._wire_db()
        res = place_powerball_bet(
            self.db,
            user_id=1,
            pick="pb_odd",
            amount=Decimal("50"),
            game_key="coinpowerball3",
        )
        self.assertFalse(res.ok)
        self.assertIn("최소", res.detail)

    @patch("app.services.powerball_service.configured_powerball_game_keys", return_value=["coinpowerball3"])
    @patch("app.services.powerball_service.effective_limits")
    def test_powerball_rejects_above_max(self, mock_el, _mock_keys) -> None:
        mock_el.return_value = (Decimal("100"), Decimal("5000"))
        self._wire_db()
        res = place_powerball_bet(
            self.db,
            user_id=1,
            pick="pb_odd",
            amount=Decimal("6000"),
            game_key="coinpowerball3",
        )
        self.assertFalse(res.ok)
        self.assertIn("최대", res.detail)

    @patch("app.services.powerball_service.merged_powerball_odds_map")
    @patch("app.services.powerball_service.get_next_round", return_value=7)
    @patch("app.services.powerball_service.configured_powerball_game_keys", return_value=["coinpowerball3"])
    @patch("app.services.powerball_service.effective_limits")
    def test_powerball_accepts_stake_in_range(
        self, mock_el, _mock_keys, _mock_round, mock_odds
    ) -> None:
        mock_el.return_value = (Decimal("100"), Decimal("50000"))
        mock_odds.return_value = default_powerball_odds_map()
        self._wire_db()
        res = place_powerball_bet(
            self.db,
            user_id=1,
            pick="pb_odd",
            amount=Decimal("1000"),
            game_key="coinpowerball3",
        )
        self.assertTrue(res.ok, msg=res.detail)
        self.assertEqual(res.bet_id, 90001)
        self.assertEqual(self.user.game_money_balance, Decimal("99000"))


if __name__ == "__main__":
    unittest.main()
