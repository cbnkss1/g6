"""시연용 공개 GET /api/mock-odds (JWT 없음)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.services.mock_sports_odds_simulator import get_public_snapshot

router = APIRouter()


@router.get(
    "/mock-odds",
    summary="데모 모의 스포츠 배당 스냅샷",
    description="GAME_PLATFORM_USE_MOCK_SPORTS_ODDS=true 일 때만 사용. 외부 API 없이 메모리 시뮬레이터 결과.",
)
def get_mock_odds() -> dict:
    if not settings.USE_MOCK_SPORTS_ODDS:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mock sports odds is disabled. Set GAME_PLATFORM_USE_MOCK_SPORTS_ODDS=true",
        )
    return get_public_snapshot()
