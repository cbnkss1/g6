from typing import Optional

from pydantic import BaseModel, Field


class AdminLoginBody(BaseModel):
    login_id: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)


class SiteConfigPublic(BaseModel):
    site_id: str
    site_name: str
    is_casino_enabled: bool
    is_powerball_enabled: bool
    is_toto_enabled: bool


class UserPublic(BaseModel):
    id: int
    login_id: str
    display_name: Optional[str]
    role: str
    site_id: str
    is_store_enabled: bool = False
    """같은 회원 테이블 기준. 게임 요율이 임계값 이상이면 ‘팀 수익(롤링) 대상’으로 true (역할과 무관)."""
    is_partner: bool = False
    game_money_balance: Optional[str] = None
    rolling_point_balance: Optional[str] = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic
    site: SiteConfigPublic
