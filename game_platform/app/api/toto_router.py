"""토토 기능 API (사이트 플래그 가드)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies.site_guards import require_site_toto_enabled

router = APIRouter()


@router.get("/features/toto/summary", summary="토토 요약 (is_toto_enabled 필요)")
def toto_summary(user=Depends(require_site_toto_enabled)) -> dict:
    return {
        "feature": "toto",
        "ok": True,
        "site_id": str(user.site_id),
    }
