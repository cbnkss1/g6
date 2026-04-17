"""
사이트별 운영 정책 (`SiteConfig.site_policies`) — 입출금 신청 검증 등.

JSON 예시 (관리자 UI에서 저장):
{
  "maintenance": { "enabled": false, "message": "점검중입니다." },
  "deposit": {
    "time_block": ["15:00", "00:15"],
    "min": "30000",
    "unit": "10000"
  },
  "withdraw": {
    "time_block": ["15:00", "00:30"],
    "min": "10000",
    "reapply_hours_after_approve": 1
  },
  "level_bonuses": [
    { "level": 1, "first_deposit_pct": 0, "every_deposit_pct": 0, "referral_deposit_pct": 0 }
  ],
  "game_providers": { "casino": { "evolution": true }, "slot": { "pragmatic": true } },
  "admin_ui": {
    "member_upline_label": "상위(추천인)",
    "member_wallet_enabled": true,
    "member_profile_edit_enabled": true
  }
}
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, Optional

from sqlalchemy import desc, select
from sqlalchemy.orm import Session
from zoneinfo import ZoneInfo

from app.models.cash_request import CashRequest
from app.models.site_config import SiteConfig

LOCAL_TZ = ZoneInfo("Asia/Seoul")


class SiteCashPolicyError(Exception):
    """HTTP 매핑용 (status_code, detail)."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def policies_dict(site: Optional[SiteConfig]) -> Dict[str, Any]:
    if site is None or not site.site_policies or not isinstance(site.site_policies, dict):
        return {}
    return dict(site.site_policies)


def merge_site_policies(existing: Optional[Dict[str, Any]], patch: Dict[str, Any]) -> Dict[str, Any]:
    base: Dict[str, Any] = dict(existing) if isinstance(existing, dict) else {}
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            base[k] = {**base[k], **v}
        else:
            base[k] = v
    return base


def _to_decimal(x: Any) -> Optional[Decimal]:
    if x is None or x == "":
        return None
    try:
        return Decimal(str(x))
    except Exception:
        return None


def _parse_hhmm(s: str) -> tuple[int, int]:
    s = (s or "").strip()
    parts = s.split(":")
    h = int(parts[0]) if parts and parts[0].strip() != "" else 0
    m = int(parts[1]) if len(parts) > 1 and parts[1].strip() != "" else 0
    return h, m


def _to_minutes(h: int, m: int) -> int:
    return h * 60 + m


def in_blocked_window_local(now_local: datetime, start_s: str, end_s: str) -> bool:
    """start~end 가 자정을 넘으면 구간을 둘로 나눔."""
    sh, sm = _parse_hhmm(start_s)
    eh, em = _parse_hhmm(end_s)
    nsm = _to_minutes(now_local.hour, now_local.minute)
    s = _to_minutes(sh, sm)
    e = _to_minutes(eh, em)
    if s <= e:
        return s <= nsm < e
    return nsm >= s or nsm < e


def _last_approved_withdraw_at(db: Session, user_id: int) -> Optional[datetime]:
    return db.scalars(
        select(CashRequest.processed_at)
        .where(
            CashRequest.user_id == user_id,
            CashRequest.request_type == "WITHDRAW",
            CashRequest.status == "APPROVED",
            CashRequest.processed_at.is_not(None),
        )
        .order_by(desc(CashRequest.processed_at))
        .limit(1)
    ).first()


def assert_cash_request_allowed(
    db: Session,
    *,
    site: SiteConfig,
    kind: str,
    amount: Decimal,
    user_id: int,
) -> None:
    """입출금 신청 생성 직전 호출. 정책 없으면 통과."""
    p = policies_dict(site)

    maint = p.get("maintenance") or {}
    if bool(maint.get("enabled")):
        msg = str(maint.get("message") or "사이트 점검 중입니다.")
        raise SiteCashPolicyError(503, msg)

    k = kind.upper()
    if k not in ("DEPOSIT", "WITHDRAW"):
        return

    section_key = "deposit" if k == "DEPOSIT" else "withdraw"
    section = p.get(section_key) or {}
    if not isinstance(section, dict):
        section = {}

    block = section.get("time_block") or section.get("block_if_local_time_between")
    if isinstance(block, (list, tuple)) and len(block) == 2:
        a, b = str(block[0]).strip(), str(block[1]).strip()
        if a and b and in_blocked_window_local(datetime.now(LOCAL_TZ), a, b):
            label = "입금" if k == "DEPOSIT" else "출금"
            raise SiteCashPolicyError(400, f"{label} 신청 불가 시간대입니다.")

    if k == "DEPOSIT":
        mn = _to_decimal(section.get("min"))
        unit = _to_decimal(section.get("unit"))
        if mn is not None and amount < mn:
            raise SiteCashPolicyError(400, f"입금 최소 금액은 {mn} 이상이어야 합니다.")
        if mn is not None and unit is not None and unit > 0:
            if (amount - mn) % unit != 0:
                raise SiteCashPolicyError(
                    400,
                    f"입금 금액은 최소 {mn} 이후 {unit} 단위여야 합니다.",
                )
    else:
        mn = _to_decimal(section.get("min"))
        if mn is not None and amount < mn:
            raise SiteCashPolicyError(400, f"출금 최소 금액은 {mn} 이상이어야 합니다.")
        raw_h = section.get("reapply_hours_after_approve")
        try:
            h = int(raw_h) if raw_h is not None else 0
        except (TypeError, ValueError):
            h = 0
        if h > 0:
            last = _last_approved_withdraw_at(db, user_id)
            if last is not None:
                if last.tzinfo is None:
                    last = last.replace(tzinfo=timezone.utc)
                elapsed = datetime.now(timezone.utc) - last
                if elapsed < timedelta(hours=h):
                    raise SiteCashPolicyError(
                        400,
                        f"직전 출금 승인 후 {h}시간이 지나야 다시 출금 신청할 수 있습니다.",
                    )
