"""partner_utils: 파트너 판별(요율 임계값)."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock

from decimal import Decimal

from app.services import partner_utils


class TestRollingRateQualifies(unittest.TestCase):
    def test_below_min_false(self) -> None:
        self.assertFalse(partner_utils.rolling_rate_qualifies_for_upline(Decimal("0")))
        self.assertFalse(
            partner_utils.rolling_rate_qualifies_for_upline(
                partner_utils.MIN_PARTNER_ROLLING_PERCENT - Decimal("0.000001")
            )
        )

    def test_at_min_true(self) -> None:
        self.assertTrue(
            partner_utils.rolling_rate_qualifies_for_upline(partner_utils.MIN_PARTNER_ROLLING_PERCENT)
        )


class TestUserIsPartner(unittest.TestCase):
    def test_no_rows(self) -> None:
        db = MagicMock()
        db.scalar.return_value = 0
        self.assertFalse(partner_utils.user_is_partner(db, 1))

    def test_has_qualifying_rate(self) -> None:
        db = MagicMock()
        db.scalar.return_value = 1
        self.assertTrue(partner_utils.user_is_partner(db, 1))

    def test_min_constant_positive(self) -> None:
        self.assertGreater(partner_utils.MIN_PARTNER_ROLLING_PERCENT, 0)


if __name__ == "__main__":
    unittest.main()
