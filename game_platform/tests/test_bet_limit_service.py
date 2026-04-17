"""배팅 한도 병합·검증 로직 단위 테스트 (DB/API 없음)."""

from __future__ import annotations

import unittest
from decimal import Decimal
from unittest.mock import MagicMock

from app.services import bet_limit_service as bls


class TestMergedSiteLimits(unittest.TestCase):
    def test_defaults_when_no_site(self):
        m = bls.merged_site_limits(None)
        self.assertIn("POWERBALL", m)
        self.assertIn("min_bet", m["POWERBALL"])
        self.assertIn("max_bet", m["POWERBALL"])

    def test_site_overrides_powerball(self):
        site = MagicMock()
        site.bet_limits = {
            "POWERBALL": {"min_bet": "500", "max_bet": "10000"},
        }
        m = bls.merged_site_limits(site)
        self.assertEqual(m["POWERBALL"]["min_bet"], "500")
        self.assertEqual(m["POWERBALL"]["max_bet"], "10000")


class TestEffectiveLimits(unittest.TestCase):
    def test_site_only(self):
        site = MagicMock()
        site.bet_limits = {"POWERBALL": {"min_bet": "100", "max_bet": "5000"}}
        mn, mx = bls.effective_limits(site, None, "POWERBALL")
        self.assertEqual(mn, Decimal("100"))
        self.assertEqual(mx, Decimal("5000"))

    def test_user_raises_max_only(self):
        site = MagicMock()
        site.bet_limits = {"POWERBALL": {"min_bet": "100", "max_bet": "5000"}}
        user = MagicMock()
        user.bet_limits_override = {"POWERBALL": {"max_bet": "20000"}}
        mn, mx = bls.effective_limits(site, user, "POWERBALL")
        self.assertEqual(mn, Decimal("100"))
        self.assertEqual(mx, Decimal("20000"))

    def test_user_cannot_lower_max_below_site(self):
        site = MagicMock()
        site.bet_limits = {"POWERBALL": {"min_bet": "100", "max_bet": "5000"}}
        user = MagicMock()
        user.bet_limits_override = {"POWERBALL": {"max_bet": "1000"}}
        mn, mx = bls.effective_limits(site, user, "POWERBALL")
        self.assertEqual(mx, Decimal("5000"))

    def test_user_min_not_below_site(self):
        site = MagicMock()
        site.bet_limits = {"POWERBALL": {"min_bet": "1000", "max_bet": "10000"}}
        user = MagicMock()
        user.bet_limits_override = {"POWERBALL": {"min_bet": "500"}}
        mn, mx = bls.effective_limits(site, user, "POWERBALL")
        self.assertEqual(mn, Decimal("1000"))

    def test_max_below_min_clamped(self):
        site = MagicMock()
        site.bet_limits = {"POWERBALL": {"min_bet": "5000", "max_bet": "1000"}}
        mn, mx = bls.effective_limits(site, None, "POWERBALL")
        self.assertEqual(mn, Decimal("5000"))
        self.assertEqual(mx, Decimal("5000"))


class TestValidateSitePatch(unittest.TestCase):
    def test_valid(self):
        out = bls.validate_site_limits_patch(
            {"POWERBALL": {"min_bet": "100", "max_bet": "9999"}}
        )
        self.assertEqual(Decimal(out["POWERBALL"]["min_bet"]), Decimal("100"))
        self.assertEqual(Decimal(out["POWERBALL"]["max_bet"]), Decimal("9999"))

    def test_max_lt_min_raises(self):
        with self.assertRaises(ValueError):
            bls.validate_site_limits_patch(
                {"POWERBALL": {"min_bet": "5000", "max_bet": "100"}}
            )


class TestValidateUserOverride(unittest.TestCase):
    def setUp(self):
        self.site = MagicMock()
        self.site.bet_limits = {"POWERBALL": {"min_bet": "100", "max_bet": "5000"}}
        self.user = MagicMock()

    def test_raise_max_ok(self):
        merged = bls.validate_user_override_patch(
            self.site,
            self.user,
            {"POWERBALL": {"max_bet": "10000"}},
        )
        self.assertEqual(Decimal(merged["POWERBALL"]["max_bet"]), Decimal("10000"))

    def test_lower_max_rejected(self):
        with self.assertRaises(ValueError) as ctx:
            bls.validate_user_override_patch(
                self.site,
                self.user,
                {"POWERBALL": {"max_bet": "1000"}},
            )
        self.assertIn("5000", str(ctx.exception))

    def test_lower_min_than_site_rejected(self):
        with self.assertRaises(ValueError):
            bls.validate_user_override_patch(
                self.site,
                self.user,
                {"POWERBALL": {"min_bet": "50"}},
            )


if __name__ == "__main__":
    unittest.main()
