"""`site_policies.game_providers` — 플레이어 카지노/슬롯 게임사 ON/OFF (어드민 게임사 제한 UI와 동일 키)."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from app.models.site_config import SiteConfig

CASINO_CATALOG_KEYS: frozenset[str] = frozenset(
    {
        "evolution",
        "dreamgame",
        "asia_gaming",
        "pragmatic_live",
        "microgaming_plus",
        "microgaming_grand",
        "oriental",
        "vegas",
        "big_gaming",
        "motivation",
        "izugi",
    }
)

SLOT_CATALOG_KEYS: frozenset[str] = frozenset(
    {
        "pragmatic",
        "asian_game_slot",
        "microgaming_slot",
        "habanero",
        "blueprint",
        "cq9",
        "red_tiger",
        "slot_matrix",
        "gmw",
        "booongo",
        "playson",
    }
)


def _bucket(site: Optional[SiteConfig], kind: str) -> Dict[str, Any]:
    if site is None or not site.site_policies or not isinstance(site.site_policies, dict):
        return {}
    gp = site.site_policies.get("game_providers")
    if not isinstance(gp, dict):
        return {}
    b = gp.get("casino" if kind == "casino" else "slot")
    return b if isinstance(b, dict) else {}


def is_catalog_provider_enabled(site: Optional[SiteConfig], *, kind: str, catalog_key: str) -> bool:
    """정책에 키가 없으면 True(기존 동작). 명시 False만 차단."""
    bucket = _bucket(site, kind)
    if catalog_key not in bucket:
        return True
    return bool(bucket.get(catalog_key))


def merged_provider_flags(site: Optional[SiteConfig]) -> Dict[str, Dict[str, bool]]:
    """UI용: 카탈로그 키마다 현재 허용 여부."""
    out: Dict[str, Dict[str, bool]] = {"casino": {}, "slot": {}}
    for k in sorted(CASINO_CATALOG_KEYS):
        out["casino"][k] = is_catalog_provider_enabled(site, kind="casino", catalog_key=k)
    for k in sorted(SLOT_CATALOG_KEYS):
        out["slot"][k] = is_catalog_provider_enabled(site, kind="slot", catalog_key=k)
    return out


def assert_launch_allowed(
    site: Optional[SiteConfig],
    *,
    kind: str,
    catalog_key: Optional[str],
) -> None:
    """런치 직전 검증. catalog_key 없으면 통과(구 클라이언트 호환)."""
    if not catalog_key:
        return
    if kind == "casino" and catalog_key not in CASINO_CATALOG_KEYS:
        return
    if kind == "slot" and catalog_key not in SLOT_CATALOG_KEYS:
        return
    if not is_catalog_provider_enabled(site, kind=kind, catalog_key=catalog_key):
        raise HTTPException(
            status_code=403,
            detail="현재 사이트 설정에서 이용할 수 없는 게임사입니다.",
        )


def catalog_key_from_provider_title(title: str, *, kind: str) -> Optional[str]:
    """V6 `providers[].title` → `site_policies.game_providers` 키 (`providerPolicyMap.ts` 와 동일 규칙)."""
    raw = title or ""
    t = raw.lower()
    if kind == "casino":
        if re.search(r"evolution", t) or "에볼" in raw:
            return "evolution"
        if re.search(r"dream\s*game", t) or "드림" in raw:
            return "dreamgame"
        if re.search(r"asia|playace", t) or "아시아" in raw:
            return "asia_gaming"
        if re.search(r"pragmatic", t) or "프라그마" in raw:
            return "pragmatic_live"
        if re.search(r"microgaming", t) and re.search(r"grand", raw, re.I):
            return "microgaming_grand"
        if re.search(r"microgaming", t):
            return "microgaming_plus"
        if re.search(r"oriental", t) or "오리엔탈" in raw:
            return "oriental"
        if re.search(r"vegas", t) or "베가스" in raw:
            return "vegas"
        if re.search(r"big\s*gaming", t) or "빅게이밍" in raw:
            return "big_gaming"
        if re.search(r"motivation", t) or "모티베이션" in raw:
            return "motivation"
        if re.search(r"izugi", t) or "이즈기" in raw:
            return "izugi"
        return None
    if kind == "slot":
        if re.search(r"pragmatic", t) or "프라그마" in raw:
            return "pragmatic"
        if re.search(r"asian\s*game", t) or "아시안게임" in raw:
            return "asian_game_slot"
        if re.search(r"microgaming", t):
            return "microgaming_slot"
        if re.search(r"habanero", t) or "하바네로" in raw:
            return "habanero"
        if re.search(r"blueprint", t) or "블루프린트" in raw:
            return "blueprint"
        if re.search(r"\bcq9\b", t):
            return "cq9"
        if re.search(r"red\s*tiger", t) or "레드타이거" in raw:
            return "red_tiger"
        if re.search(r"slot\s*matrix", t) or "슬롯매트릭스" in raw:
            return "slot_matrix"
        if re.search(r"\bgmw\b", t):
            return "gmw"
        if re.search(r"booongo", t) or "부운고" in raw:
            return "booongo"
        if re.search(r"playson", t) or "플레이손" in raw:
            return "playson"
        return None
    return None


def filter_catalog_provider_rows(
    rows: List[Any],
    site: Optional[SiteConfig],
    *,
    kind: str,
) -> List[Dict[str, Any]]:
    """업스트림 provider 행(dict) 목록을 사이트 게임사 정책으로 필터."""
    out: List[Dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        title = str(row.get("title") or "")
        key = catalog_key_from_provider_title(title, kind=kind)
        if key is None or is_catalog_provider_enabled(site, kind=kind, catalog_key=key):
            out.append(row)
    return out
