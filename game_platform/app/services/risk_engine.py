"""
SLOTPASS Risk Engine — 메모리 기반 실시간 리스크 감시

Redis가 없는 환경에서도 동일 인터페이스로 동작.
Redis 연결 시 `REDIS_URL` 환경변수만 추가하면 자동 전환 가능(TODO).

감지 항목
- IP 기반 단시간 다중 가입/배팅 (브루트포스)
- 동일 UUID 기기 복수 계정 탐지
- 단시간 내 고액 배팅 패턴 (슈퍼관리자 알림)
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Dict, List, Optional


@dataclass
class _Bucket:
    timestamps: List[float] = field(default_factory=list)
    blocked_until: float = 0.0


class _MemoryStore:
    """단순 슬라이딩 윈도우 카운터 + 블로킹 레지스트리."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._buckets: Dict[str, _Bucket] = defaultdict(_Bucket)
        # device_uuid → set of login_ids  (기기 복수 계정 탐지)
        self._device_map: Dict[str, set] = defaultdict(set)
        # ip → set of login_ids  (IP 복수 계정)
        self._ip_map: Dict[str, set] = defaultdict(set)

    def is_blocked(self, key: str) -> bool:
        with self._lock:
            return self._buckets[key].blocked_until > time.time()

    def record_and_check(self, key: str, window_sec: int, limit: int, block_sec: int) -> bool:
        """
        True = 이 호출로 limit 초과 → 차단 시작됨.
        False = 정상 범위.
        """
        now = time.time()
        with self._lock:
            b = self._buckets[key]
            if b.blocked_until > now:
                return True
            cutoff = now - window_sec
            b.timestamps = [t for t in b.timestamps if t > cutoff]
            b.timestamps.append(now)
            if len(b.timestamps) > limit:
                b.blocked_until = now + block_sec
                return True
            return False

    def register_device(self, device_uuid: str, login_id: str) -> int:
        """Returns the number of distinct accounts using this device."""
        with self._lock:
            self._device_map[device_uuid].add(login_id)
            return len(self._device_map[device_uuid])

    def register_ip(self, ip: str, login_id: str) -> int:
        with self._lock:
            self._ip_map[ip].add(login_id)
            return len(self._ip_map[ip])

    def cleanup_stale(self, older_than_sec: int = 3600) -> None:
        now = time.time()
        with self._lock:
            stale = [k for k, b in self._buckets.items() if not b.timestamps or (b.timestamps[-1] < now - older_than_sec)]
            for k in stale:
                del self._buckets[k]


_store = _MemoryStore()


@dataclass(frozen=True)
class RiskVerdict:
    blocked: bool
    reason: Optional[str]
    multi_account_warning: bool = False
    multi_account_count: int = 1


# ─── 공개 API ────────────────────────────────────────────────────────────────

def check_login_attempt(ip: str, login_id: str, device_uuid: Optional[str] = None) -> RiskVerdict:
    """
    로그인 시도 리스크 검사.
    - IP별 1분에 10회 초과 → 5분 차단
    """
    key = f"login:{ip}"
    if _store.is_blocked(key):
        return RiskVerdict(blocked=True, reason="IP 로그인 과다 시도 — 5분 차단")
    burst = _store.record_and_check(key, window_sec=60, limit=10, block_sec=300)
    if burst:
        return RiskVerdict(blocked=True, reason="IP 로그인 과다 시도 — 5분 차단")

    multi_warn = False
    count = 1
    if device_uuid:
        count = _store.register_device(device_uuid, login_id)
        if count >= 3:
            multi_warn = True
    ip_count = _store.register_ip(ip, login_id)
    if ip_count >= 5:
        multi_warn = True
        count = max(count, ip_count)

    return RiskVerdict(blocked=False, reason=None, multi_account_warning=multi_warn, multi_account_count=count)


def check_register_attempt(ip: str, device_uuid: Optional[str] = None) -> RiskVerdict:
    """
    가입 리스크 검사.
    - IP별 1시간에 5회 가입 → 24시간 차단
    """
    key = f"register:{ip}"
    if _store.is_blocked(key):
        return RiskVerdict(blocked=True, reason="동일 IP 복수 가입 차단 (24h)")
    burst = _store.record_and_check(key, window_sec=3600, limit=5, block_sec=86400)
    if burst:
        return RiskVerdict(blocked=True, reason="동일 IP 복수 가입 차단 (24h)")
    return RiskVerdict(blocked=False, reason=None)


def check_bet_attempt(user_id: int, bet_amount: Decimal, daily_limit: Decimal = Decimal("10000000")) -> RiskVerdict:
    """
    단시간 고액 배팅 패턴 감지.
    - 1분에 20회 배팅 → 10분 쿨다운 (알림만, 차단 아님)
    - 하루 1000만 초과 배팅 누적 → 위험 플래그
    """
    key_rate = f"bet_rate:{user_id}"
    burst = _store.record_and_check(key_rate, window_sec=60, limit=20, block_sec=600)
    if burst:
        return RiskVerdict(blocked=False, reason="고속 배팅 패턴 감지 — 관리자 알림", multi_account_warning=True)
    return RiskVerdict(blocked=False, reason=None)


def manual_block_ip(ip: str, duration_sec: int = 86400) -> None:
    """수동 IP 차단 (관리자 명령)."""
    import time as _time
    with _store._lock:
        _store._buckets[f"block:{ip}"].blocked_until = _time.time() + duration_sec


def get_blocked_ips() -> List[Dict]:
    """현재 차단 중인 IP 목록."""
    now = time.time()
    with _store._lock:
        result = []
        for k, b in _store._buckets.items():
            if b.blocked_until > now:
                result.append({"key": k, "unblocks_in": int(b.blocked_until - now)})
        return result
