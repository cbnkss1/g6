"""사이트 기본 + 회원 오버라이드 배팅 한도 (종목별 min / 1회 max)."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Optional, Tuple

from app.core.config import settings
from app.models.site_config import SiteConfig
from app.models.user import User

GAME_KEYS = frozenset({"POWERBALL", "SPORTS", "CASINO", "SLOT"})


def _code_defaults() -> Dict[str, Dict[str, str]]:
    pb_min = str(settings.POWERBALL_MIN_BET)
    big = "100000000"
    return {
        "POWERBALL": {"min_bet": pb_min, "max_bet": big},
        "SPORTS": {"min_bet": "1000", "max_bet": big},
        "CASINO": {"min_bet": "1000", "max_bet": big},
        "SLOT": {"min_bet": "1000", "max_bet": big},
    }


def merged_site_limits(site: Optional[SiteConfig]) -> Dict[str, Dict[str, str]]:
    """코드 기본값 위에 gp_site_configs.bet_limits 를 덮어씀."""
    out = {k: dict(v) for k, v in _code_defaults().items()}
    raw = getattr(site, "bet_limits", None) if site else None
    if not isinstance(raw, dict):
        return out
    for gk, block in raw.items():
        key = str(gk).strip().upper()
        if key not in GAME_KEYS or not isinstance(block, dict):
            continue
        cur = out.setdefault(key, {})
        for fld in ("min_bet", "max_bet"):
            if fld in block and block[fld] is not None:
                cur[fld] = str(block[fld]).strip()
    return out


def _parse_money(v: Any) -> Optional[Decimal]:
    if v is None or v == "":
        return None
    try:
        d = Decimal(str(v).strip())
    except (InvalidOperation, ValueError, TypeError):
        return None
    return d.quantize(Decimal("0.000001"))


def effective_limits(
    site: Optional[SiteConfig],
    user: Optional[User],
    game_key: str,
) -> Tuple[Decimal, Decimal]:
    """
    (min_bet, max_bet) — 1회(1판) 스테이크 기준.
    회원 오버라이드: min_bet 는 사이트 이상만, max_bet 는 사이트 이상(상향)만 허용.
    """
    gk = game_key.strip().upper()
    if gk not in GAME_KEYS:
        gk = "POWERBALL"
    site_m = merged_site_limits(site).get(gk, _code_defaults()[gk])
    s_min = _parse_money(site_m.get("min_bet")) or Decimal("1")
    s_max = _parse_money(site_m.get("max_bet")) or Decimal("100000000")
    if s_min < 0:
        s_min = Decimal("0")
    if s_max < s_min:
        s_max = s_min

    u_min, u_max = s_min, s_max
    o = getattr(user, "bet_limits_override", None) if user else None
    if isinstance(o, dict):
        block = o.get(gk) or o.get(game_key)
        if isinstance(block, dict):
            um = _parse_money(block.get("min_bet"))
            ux = _parse_money(block.get("max_bet"))
            if um is not None:
                u_min = max(s_min, um)
            if ux is not None:
                # 상향만 의미 있음: 사이트보다 낮게 저장된 값은 무시하고 사이트 상한 적용
                u_max = max(s_max, ux)
    if u_max < u_min:
        u_max = u_min
    return u_min, u_max


def validate_site_limits_patch(raw: Dict[str, Any]) -> Dict[str, Dict[str, str]]:
    """PATCH 본문 검증 후 저장용 dict."""
    if not isinstance(raw, dict):
        raise ValueError("limits 는 객체여야 합니다.")
    out: Dict[str, Dict[str, str]] = {}
    for gk, block in raw.items():
        key = str(gk).strip().upper()
        if key not in GAME_KEYS:
            continue
        if not isinstance(block, dict):
            continue
        cur: Dict[str, str] = {}
        for fld in ("min_bet", "max_bet"):
            if fld not in block or block[fld] is None or str(block[fld]).strip() == "":
                continue
            d = _parse_money(block[fld])
            if d is None or d < 0:
                raise ValueError(f"{key}.{fld} 금액이 올바르지 않습니다.")
            cur[fld] = str(d)
        if cur:
            mn = _parse_money(cur.get("min_bet", "0"))
            mx = _parse_money(cur.get("max_bet", "0"))
            if mn and mx and mx < mn:
                raise ValueError(f"{key}: max_bet 은 min_bet 이상이어야 합니다.")
            out[key] = cur
    return out


def validate_user_override_patch(
    site: SiteConfig,
    user: User,
    raw: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """회원 오버라이드 PATCH. 빈 dict 이면 None(삭제) 반환."""
    if not isinstance(raw, dict):
        raise ValueError("overrides 는 객체여야 합니다.")
    site_m = merged_site_limits(site)
    merged: Dict[str, Any] = {}
    for gk, block in raw.items():
        key = str(gk).strip().upper()
        if key not in GAME_KEYS:
            continue
        if not isinstance(block, dict):
            continue
        s = site_m.get(key, _code_defaults()[key])
        s_min = _parse_money(s.get("min_bet")) or Decimal("1")
        s_max = _parse_money(s.get("max_bet")) or Decimal("100000000")
        entry: Dict[str, str] = {}
        if "min_bet" in block and block["min_bet"] is not None and str(block["min_bet"]).strip() != "":
            um = _parse_money(block["min_bet"])
            if um is None:
                raise ValueError(f"{key}.min_bet 형식 오류")
            if um < s_min:
                raise ValueError(f"{key}.min_bet 은 사이트 최소({s_min}) 미만일 수 없습니다.")
            entry["min_bet"] = str(um)
        if "max_bet" in block and block["max_bet"] is not None and str(block["max_bet"]).strip() != "":
            ux = _parse_money(block["max_bet"])
            if ux is None:
                raise ValueError(f"{key}.max_bet 형식 오류")
            if ux < s_max:
                raise ValueError(f"{key}.max_bet 은 사이트 상한({s_max}) 미만으로 설정할 수 없습니다.")
            entry["max_bet"] = str(ux)
        if entry:
            merged[key] = entry
    return merged or None
