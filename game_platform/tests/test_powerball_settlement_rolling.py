"""파워볼 정산 후 유효 배팅 수식·차액 정산 연동 검증.

실제 배팅은 place_powerball_bet → 스테이크 원장,
정산은 settle_round → 당첨 시 게임머니 지급 + `_apply_powerball_differential_commission`(차액 롤링·루징);
외부 게임 API는 `/internal/settle` → `SettlementService.settle_from_game_api` 동일 엔진.
"""
from __future__ import annotations

import unittest
from decimal import Decimal
from unittest.mock import MagicMock, patch

from app.models.enums import BetStatus, GameResult, GameType
from app.models.user import User
from app.services.differential_commission_service import DifferentialCommissionResult
from app.services.partner_utils import MIN_PARTNER_ROLLING_PERCENT
from app.services.settlement_basis import valid_bet_amount_for_rolling
from app.services.settlement_service import SettlementService


class TestValidBetForRolling(unittest.TestCase):
    def test_win_lose_are_full_stake(self) -> None:
        s = Decimal("12345.678901")
        self.assertEqual(valid_bet_amount_for_rolling(s, "WIN"), s)
        self.assertEqual(valid_bet_amount_for_rolling(s, "LOSE"), s)

    def test_void_is_zero(self) -> None:
        self.assertEqual(
            valid_bet_amount_for_rolling(Decimal("1000"), "VOID"), Decimal("0")
        )


class TestSettlementDifferentialCommission(unittest.TestCase):
    """SettlementService.settle_from_game_api — 차액 롤링·루징 연동."""

    def _make_user(self, uid: int, ref_id: int | None, gm: str, rp: str) -> User:
        u = User()
        u.id = uid
        u.referrer_id = ref_id
        u.game_money_balance = Decimal(gm)
        u.rolling_point_balance = Decimal(rp)
        return u

    @patch("app.services.settlement_service.DifferentialCommissionService.apply")
    def test_differential_on_lose(self, mock_apply: MagicMock) -> None:
        mock_apply.return_value = DifferentialCommissionResult(
            total_rolling_points=Decimal("500"),
            total_losing_points=Decimal("0"),
            beneficiary_count=1,
            detail="ok",
        )

        bet = MagicMock()
        bet.id = 42
        bet.user_id = 1
        bet.game_type = GameType.POWERBALL.value
        bet.bet_amount = Decimal("10000")
        bet.status = BetStatus.PENDING.value

        bettor = self._make_user(1, 2, "90000", "0")

        db = MagicMock()
        call_n = [0]

        def scalars_side_effect(_sel):
            m = MagicMock()
            n = call_n[0]
            call_n[0] += 1
            if n == 0:
                m.one_or_none.return_value = bet
            elif n == 1:
                m.one.return_value = bettor
            else:
                raise AssertionError(f"unexpected scalars call {n}")
            return m

        db.scalars.side_effect = scalars_side_effect

        res = SettlementService.settle_from_game_api(
            db,
            external_bet_uid="gp_pb_99",
            game_result=GameResult.LOSE,
            win_amount=Decimal("0"),
        )

        self.assertTrue(res.ok)
        self.assertEqual(res.valid_bet_for_rolling, Decimal("10000"))
        self.assertEqual(res.total_rolling_points, Decimal("500"))
        self.assertEqual(res.total_losing_points, Decimal("0"))
        mock_apply.assert_called_once()

    @patch("app.services.settlement_service.DifferentialCommissionService.apply")
    def test_no_upline_zero_commission(self, mock_apply: MagicMock) -> None:
        mock_apply.return_value = DifferentialCommissionResult(
            total_rolling_points=Decimal("0"),
            total_losing_points=Decimal("0"),
            beneficiary_count=0,
            detail="no_upline",
        )

        bet = MagicMock()
        bet.id = 43
        bet.user_id = 1
        bet.game_type = GameType.POWERBALL.value
        bet.bet_amount = Decimal("5000")
        bet.status = BetStatus.PENDING.value

        bettor = self._make_user(1, None, "95000", "0")

        db = MagicMock()
        n = [0]

        def scalars_side_effect(_sel):
            m = MagicMock()
            n[0] += 1
            if n[0] == 1:
                m.one_or_none.return_value = bet
            elif n[0] == 2:
                m.one.return_value = bettor
            else:
                raise AssertionError(f"unexpected scalars call {n[0]}")
            return m

        db.scalars.side_effect = scalars_side_effect

        res = SettlementService.settle_from_game_api(
            db,
            external_bet_uid="gp_pb_100",
            game_result=GameResult.WIN,
            win_amount=Decimal("9750"),
        )
        self.assertTrue(res.ok)
        self.assertEqual(res.total_rolling_points, Decimal("0"))
        self.assertEqual(res.total_losing_points, Decimal("0"))


class TestMinPartnerThreshold(unittest.TestCase):
    def test_rate_below_min_no_upline(self) -> None:
        from app.services.partner_utils import rolling_rate_qualifies_for_upline

        self.assertFalse(rolling_rate_qualifies_for_upline(Decimal("0")))
        self.assertFalse(rolling_rate_qualifies_for_upline(MIN_PARTNER_ROLLING_PERCENT / Decimal("10")))
        self.assertTrue(rolling_rate_qualifies_for_upline(MIN_PARTNER_ROLLING_PERCENT))


if __name__ == "__main__":
    unittest.main()
