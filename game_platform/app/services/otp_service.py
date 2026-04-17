"""
TOTP (Google Authenticator 호환) OTP 서비스.

흐름:
1. 관리자가 OTP 등록 요청 → generate_secret() → QR URI 반환
2. 앱에서 코드 확인 후 verify_and_enable() 호출 → otp_enabled = True
3. 이후 로그인 시 otp_enabled=True 면 OTP 코드 추가 검증 필요
"""
from __future__ import annotations

import pyotp

# OTP 앱 표시명
OTP_ISSUER = "SLOTPASS Admin"


def generate_secret() -> str:
    """새 TOTP 시크릿 키 발급 (Base32 32자)."""
    return pyotp.random_base32()


def get_provisioning_uri(secret: str, login_id: str) -> str:
    """Google Authenticator / Authy 등록용 otpauth URI."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=login_id, issuer_name=OTP_ISSUER)


def verify_totp(secret: str, code: str, valid_window: int = 1) -> bool:
    """
    TOTP 코드 검증.
    valid_window=1 → ±30초 (네트워크 딜레이 허용).
    """
    if not secret or not code:
        return False
    totp = pyotp.TOTP(secret)
    return totp.verify(code.strip(), valid_window=valid_window)
