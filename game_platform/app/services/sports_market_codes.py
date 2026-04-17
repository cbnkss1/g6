"""
스포츠 토토 확장 마켓 outcome 키 (The Odds API spreads / totals 와 정산 공통).

- 승무패: HOME_WIN, DRAW, AWAY_WIN
- 합계(언더/오버): T_O_{w}_{t} / T_U_{w}_{t}  (라인 = w + t/10, 예: T_O_220_5 → 220.5)
- 핸디(스프레드): S_{H|A}_{M|P}{w}_{t}  (API point 부호: M=음수, P=양수, 예: S_H_M5_5 → 홈 -5.5)
"""
from __future__ import annotations

import re
from decimal import Decimal
from typing import Literal, Optional, Tuple

H2H_OUTCOMES = frozenset({"HOME_WIN", "DRAW", "AWAY_WIN"})

_TOTAL_RE = re.compile(r"^T_([OU])_(\d+)_(\d)$")
_SPREAD_RE = re.compile(r"^S_([HA])_([MP])(\d+)_(\d)$")


def encode_positive_line_key(line: float) -> str:
    """0 이상 라인(토탈 기준점) → \"220_5\" 형태."""
    tenths = int(round(float(line) * 10))
    if tenths < 0:
        raise ValueError("total line must be non-negative")
    w, f = divmod(tenths, 10)
    return f"{w}_{f}"


def encode_signed_point_key(api_point: float) -> str:
    """스프레드 point (음수=홈쪽 마이너스 등) → M5_5 / P3_0."""
    tenths = int(round(abs(float(api_point)) * 10))
    w, f = divmod(tenths, 10)
    prefix: Literal["M", "P"] = "M" if api_point < 0 else "P"
    return f"{prefix}{w}_{f}"


def total_outcome_key(side: Literal["O", "U"], line: float) -> str:
    body = encode_positive_line_key(line)
    return f"T_{side}_{body}"


def spread_outcome_key(pick_home: bool, api_point: float) -> str:
    side = "H" if pick_home else "A"
    return f"S_{side}_{encode_signed_point_key(api_point)}"


def parse_total_outcome(sel: str) -> Optional[Tuple[Literal["O", "U"], float]]:
    m = _TOTAL_RE.fullmatch(sel.strip().upper())
    if not m:
        return None
    side = m.group(1)
    w, f = int(m.group(2)), int(m.group(3))
    if f < 0 or f > 9:
        return None
    line = w + f / 10.0
    return side, line  # type: ignore[return-value]


def parse_spread_outcome(sel: str) -> Optional[Tuple[Literal["H", "A"], float]]:
    m = _SPREAD_RE.fullmatch(sel.strip().upper())
    if not m:
        return None
    ha = m.group(1)
    sign = m.group(2)
    w, f = int(m.group(3)), int(m.group(4))
    if f < 0 or f > 9:
        return None
    mag = w + f / 10.0
    api_point = -mag if sign == "M" else mag
    return ha, api_point  # type: ignore[return-value]


def is_known_extended_outcome(sel: str) -> bool:
    u = sel.strip().upper()
    return parse_total_outcome(u) is not None or parse_spread_outcome(u) is not None


def slip_result_for_total_under_over(
    home_score: int,
    away_score: int,
    selected: str,
) -> str:
    """WON / LOST / TIE / VOID"""
    p = parse_total_outcome(selected.strip().upper())
    if not p:
        return "VOID"
    side, line = p
    total = home_score + away_score
    if side == "O":
        if total > line:
            return "WON"
        if total < line:
            return "LOST"
        return "TIE"
    # Under
    if total < line:
        return "WON"
    if total > line:
        return "LOST"
    return "TIE"


def slip_result_for_spread(
    home_score: int,
    away_score: int,
    selected: str,
) -> str:
    margin = float(home_score - away_score)
    p = parse_spread_outcome(selected.strip().upper())
    if not p:
        return "VOID"
    side, api_point = p
    if side == "H":
        if margin > -api_point:
            return "WON"
        if margin < -api_point:
            return "LOST"
        return "TIE"
    # Away pick
    if margin < api_point:
        return "WON"
    if margin > api_point:
        return "LOST"
    return "TIE"


def is_valid_odds_outcome_key(oc: str) -> bool:
    u = oc.strip().upper()
    if u in H2H_OUTCOMES:
        return True
    return is_known_extended_outcome(u)


def odds_value_ok(val: Decimal) -> bool:
    return val >= Decimal("1")
