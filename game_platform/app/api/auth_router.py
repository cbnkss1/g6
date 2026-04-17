"""어드민 JWT 로그인·세션 정보 + OTP 2차 인증 + Risk Engine 통합."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants import USER_ROLE_PLAYER
from app.core.database import get_db
from app.core.security import create_access_token, verify_password
from app.dependencies.auth_jwt import get_current_user_from_token, require_admin_user
from app.models.site_config import SiteConfig
from app.models.user import User
from app.schemas.auth import AdminLoginBody, LoginResponse, SiteConfigPublic, UserPublic
from app.services.admin_ip_allowlist import assert_admin_login_ip_allowed
from app.services.audit_service import AuditService
from app.services.otp_service import verify_totp
from app.services.partner_utils import user_is_partner
from app.services.risk_engine import check_login_attempt

router = APIRouter()


class OtpLoginBody(BaseModel):
    """OTP 코드가 포함된 로그인 (2단계)."""
    login_id: str
    password: str
    otp_code: Optional[str] = None
    device_uuid: Optional[str] = None


def _site_public(site: SiteConfig) -> SiteConfigPublic:
    return SiteConfigPublic(
        site_id=str(site.site_id),
        site_name=site.site_name,
        is_casino_enabled=site.is_casino_enabled,
        is_powerball_enabled=site.is_powerball_enabled,
        is_toto_enabled=site.is_toto_enabled,
    )


def _user_public(db: Session, user: User) -> UserPublic:
    return UserPublic(
        id=user.id,
        login_id=user.login_id,
        display_name=user.display_name,
        role=user.role,
        site_id=str(user.site_id),
        is_store_enabled=bool(user.is_store_enabled),
        is_partner=user_is_partner(db, user.id),
        game_money_balance=str(user.game_money_balance),
        rolling_point_balance=str(user.rolling_point_balance),
    )


@router.post("/login", response_model=LoginResponse, summary="어드민 로그인 (JWT + OTP + Risk)")
def admin_login(
    body: OtpLoginBody,
    db: Session = Depends(get_db),
    request: Request = None,
) -> LoginResponse:
    client_ip = request.client.host if request and request.client else "unknown"

    # ── E1: Risk Engine — IP 브루트포스 차단 ──────────────────────────────────
    verdict = check_login_attempt(
        ip=client_ip,
        login_id=body.login_id.strip(),
        device_uuid=body.device_uuid,
    )
    if verdict.blocked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"로그인 제한: {verdict.reason}",
        )

    # ── 기본 자격증명 확인 ────────────────────────────────────────────────────
    user = db.scalar(select(User).where(User.login_id == body.login_id.strip()))
    if user is None or not verify_password(body.password, user.hashed_password):
        AuditService.log(
            db, actor=None, action="LOGIN_FAIL",
            target_type="USER", target_id=body.login_id,
            note=f"IP={client_ip}",
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="아이디 또는 비밀번호가 올바르지 않습니다.",
        )

    if not getattr(user, "is_active", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="비활성화된 계정입니다.")

    if user.role == USER_ROLE_PLAYER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="플레이어 계정은 메인 사이트 로그인을 이용해 주세요.",
        )

    assert_admin_login_ip_allowed(db, site_id=user.site_id, client_ip=client_ip)

    # ── E5: OTP 2차 인증 ──────────────────────────────────────────────────────
    if user.otp_enabled:
        if not body.otp_code:
            # 프론트에 OTP 입력 필요 신호
            raise HTTPException(
                status_code=status.HTTP_202_ACCEPTED,
                detail="OTP_REQUIRED",
                headers={"X-OTP-Required": "true"},
            )
        if not verify_totp(user.otp_secret, body.otp_code):
            AuditService.log(
                db, actor=user, action="OTP_FAIL",
                target_type="USER", target_id=str(user.id),
                note=f"IP={client_ip}",
            )
            db.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="OTP 코드가 올바르지 않습니다.")

    site = db.get(SiteConfig, user.site_id)
    if site is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Site configuration missing",
        )

    token = create_access_token(
        user_id=user.id,
        role=user.role,
        site_id=str(user.site_id),
    )

    # ── 로그인 성공 감사 기록 ─────────────────────────────────────────────────
    AuditService.log(
        db, actor=user, action="LOGIN_OK",
        target_type="USER", target_id=str(user.id),
        note=f"IP={client_ip}" + (", multi-account-warn" if verdict.multi_account_warning else ""),
        actor_ip=client_ip,
    )
    db.commit()

    return LoginResponse(
        access_token=token,
        user=_user_public(db, user),
        site=_site_public(site),
    )


@router.get("/me", summary="현재 JWT 유저 + 사이트")
def admin_me(
    user=Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
) -> dict:
    site = db.get(SiteConfig, user.site_id)
    if site is None:
        raise HTTPException(status_code=500, detail="Site configuration missing")
    return {
        "user": _user_public(db, user).model_dump(),
        "site": _site_public(site).model_dump(),
        "otp_enabled": bool(getattr(user, "otp_enabled", False)),
    }


@router.get("/site-config", response_model=SiteConfigPublic, summary="분양 사이트 기능 플래그")
def admin_site_config(
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> SiteConfigPublic:
    site = db.get(SiteConfig, user.site_id)
    if site is None:
        raise HTTPException(status_code=404, detail="site not found")
    return _site_public(site)
