"""한국 표준시(Asia/Seoul) 기준 날짜·‘오늘’ 경계. DB 비교는 UTC aware datetime 사용."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Optional, Tuple
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def kst_day_start_utc(now: Optional[datetime] = None) -> datetime:
    """KST 달력 ‘오늘’ 자정(KST)에 해당하는 순간(UTC aware). 대시보드·당일 롤링 라인 등."""
    if now is None:
        now = now_utc()
    elif now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    kst_now = now.astimezone(KST)
    start_kst = kst_now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start_kst.astimezone(timezone.utc)


def kst_calendar_window_utc(d0: date, d1: date) -> Tuple[datetime, datetime]:
    """KST 달력 날짜 d0~d1(양끝 포함) 구간 [t0, t1) — t0,t1은 UTC aware."""
    t0_local = datetime.combine(d0, time.min, tzinfo=KST)
    t1_local = datetime.combine(d1, time.min, tzinfo=KST) + timedelta(days=1)
    return t0_local.astimezone(timezone.utc), t1_local.astimezone(timezone.utc)


def kst_today_date(now: Optional[datetime] = None) -> date:
    """KST 달력 기준 ‘오늘’ 날짜."""
    if now is None:
        now = now_utc()
    elif now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return now.astimezone(KST).date()
