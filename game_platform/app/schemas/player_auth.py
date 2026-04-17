from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.auth import LoginResponse


class PlayerRegisterGeneralBody(BaseModel):
    """일반 회원가입."""

    login_id: str = Field(..., min_length=3, max_length=32)
    password: str = Field(..., min_length=6, max_length=128)
    nickname: str = Field(..., min_length=2, max_length=32)
    signup_code: Optional[str] = Field(None, max_length=64)
    bank_name: str = Field(..., min_length=1, max_length=64)
    bank_account: str = Field(..., min_length=1, max_length=128)
    account_holder: str = Field(..., min_length=1, max_length=64)
    withdraw_password: str = Field(..., min_length=4, max_length=64)
    telecom_carrier: str = Field(..., min_length=1, max_length=16)
    phone: str = Field(..., min_length=10, max_length=16)
    birth_ymd: str = Field(..., min_length=8, max_length=8)
    gender: str = Field(..., min_length=1, max_length=16)
    telegram_id: Optional[str] = Field(None, max_length=64)
    site_id: Optional[str] = Field(None, description="미입력 시 기본 분양 사이트 UUID")

    @field_validator("login_id")
    @classmethod
    def login_id_chars(cls, v: str) -> str:
        s = v.strip()
        if not s.replace("_", "").isalnum():
            raise ValueError("아이디는 영문, 숫자, 밑줄만 사용할 수 있습니다.")
        return s

    @field_validator("birth_ymd")
    @classmethod
    def birth_digits(cls, v: str) -> str:
        s = v.strip()
        if not s.isdigit() or len(s) != 8:
            raise ValueError("생년월일은 YYYYMMDD 8자리 숫자여야 합니다.")
        return s


class PlayerRegisterAnonymousBody(BaseModel):
    """무기명 회원가입 — 서버가 아이디 자동 발급."""

    password: str = Field(..., min_length=6, max_length=128)
    nickname: str = Field(..., min_length=2, max_length=32)
    signup_code: Optional[str] = Field(None, max_length=64)
    bank_name: str = Field(..., min_length=1, max_length=64)
    bank_account: str = Field(..., min_length=1, max_length=128)
    account_holder: str = Field(..., min_length=1, max_length=64)
    withdraw_password: str = Field(..., min_length=4, max_length=64)
    telecom_carrier: str = Field(..., min_length=1, max_length=16)
    phone: str = Field(..., min_length=10, max_length=16)
    birth_ymd: str = Field(..., min_length=8, max_length=8)
    gender: str = Field(..., min_length=1, max_length=16)
    telegram_id: Optional[str] = Field(None, max_length=64)
    site_id: Optional[str] = Field(None)

    @field_validator("birth_ymd")
    @classmethod
    def birth_digits(cls, v: str) -> str:
        s = v.strip()
        if not s.isdigit() or len(s) != 8:
            raise ValueError("생년월일은 YYYYMMDD 8자리 숫자여야 합니다.")
        return s


class PlayerLoginBody(BaseModel):
    login_id: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)
    device_uuid: Optional[str] = None


class PlayerRegisterResult(LoginResponse):
    """가입 직후 로그인 토큰 + 무기명 시 발급 아이디 안내."""

    assigned_login_id: Optional[str] = None
