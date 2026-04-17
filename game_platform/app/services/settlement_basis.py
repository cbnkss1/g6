"""
정산·롤링 산정 기준: 총 배팅 볼륨 vs 유효 배팅(롤링·실질 정산 기준) 분리.

- Total Bet: 정산 완료된 건의 스테이크 전부 (TIE·취소·적특 포함) — 대시보드 볼륨.
- Valid Bet: 승(WIN)·패(LOSE)로만 판정된 스테이크 — 롤링·실무 정산 기준.
  TIE, CANCEL, VOID, PUSH 등 원금 환불형 결과는 유효 배팅 0 (롤링 없음).
"""
from __future__ import annotations

from decimal import Decimal
from typing import FrozenSet, Optional

# 원금이 그대로 돌아가는 등 '승패가 갈리지 않은' 결과 → 롤링·유효 배팅 제외
REFUND_LIKE_RESULTS: FrozenSet[str] = frozenset(
    {
        "TIE",
        "CANCEL",
        "VOID",
        "PUSH",
        "REFUND",
        "ABANDONED",
        "UNCERTAIN",
    }
)

# 실제 승패 확정 — 스테이크 전액이 유효 배팅으로 간주
DECISIVE_RESULTS: FrozenSet[str] = frozenset({"WIN", "LOSE"})


def normalize_game_result(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    s = value.strip().upper()
    return s if s else None


def is_refund_like_result(game_result: Optional[str]) -> bool:
    g = normalize_game_result(game_result)
    if g is None:
        return True
    return g in REFUND_LIKE_RESULTS


def is_decisive_result(game_result: Optional[str]) -> bool:
    g = normalize_game_result(game_result)
    return g is not None and g in DECISIVE_RESULTS


def valid_bet_amount_for_rolling(stake: Decimal, game_result: Optional[str]) -> Decimal:
    """롤링 적립 산정용 유효 배팅액. 환불형·미확정이면 0."""
    stake = Decimal(stake).quantize(Decimal("0.000001"))
    if not is_decisive_result(game_result):
        return Decimal("0")
    return stake
