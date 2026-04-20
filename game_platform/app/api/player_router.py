"""플레이어(배팅 회원) 회원가입·로그인."""
from __future__ import annotations

import secrets
import uuid
from decimal import Decimal
from typing import Any, Dict, Optional, Union

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.constants import DEFAULT_SITE_ID, USER_ROLE_PLAYER
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.dependencies.auth_jwt import get_current_user_from_token
from app.models.cash_request import CashRequest
from app.models.enums import GameMoneyLedgerReason, RollingPointLedgerReason
from app.models.ledger import GameMoneyLedgerEntry, RollingPointLedgerEntry
from app.models.site_config import SiteConfig
from app.models.user import User
from app.schemas.auth import LoginResponse, SiteConfigPublic, UserPublic
from app.schemas.player_auth import (
    PlayerLoginBody,
    PlayerRegisterAnonymousBody,
    PlayerRegisterGeneralBody,
    PlayerRegisterResult,
)
from app.services.audit_service import AuditService
from app.services.cash_service import CashService, cash_request_to_dict
from app.services.site_policy_service import SiteCashPolicyError, assert_cash_request_allowed
from app.services.partner_utils import user_is_partner
from app.services.player_presence import touch_player_presence
from app.services.risk_engine import check_login_attempt, check_register_attempt
from app.websockets.manager import admin_ws_manager

router = APIRouter()


def _site_public(site: SiteConfig) -> SiteConfigPublic:
    return SiteConfigPublic(
        site_id=str(site.site_id),
        site_name=site.site_name,
        is_casino_enabled=site.is_casino_enabled,
        is_powerball_enabled=site.is_powerball_enabled,
        is_toto_enabled=site.is_toto_enabled,
    )


def _resolve_site_id_for_public_pages(db: Session, site_id: Optional[str]) -> uuid.UUID:
    """`GET /public-pages` — site_id 없으면 기본 테넌트."""
    if site_id and site_id.strip():
        try:
            sid = uuid.UUID(site_id.strip())
        except ValueError as e:
            raise HTTPException(status_code=400, detail="site_id 형식 오류") from e
        if db.get(SiteConfig, sid) is None:
            raise HTTPException(status_code=404, detail="사이트를 찾을 수 없습니다.")
        return sid
    return DEFAULT_SITE_ID


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


def _parse_site_id(db: Session, site_id_raw: Optional[str]) -> uuid.UUID:
    if site_id_raw and site_id_raw.strip():
        try:
            sid = uuid.UUID(site_id_raw.strip())
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="잘못된 사이트 식별자입니다.",
            ) from e
        if db.get(SiteConfig, sid) is None:
            raise HTTPException(status_code=400, detail="사이트를 찾을 수 없습니다.")
        return sid
    if db.get(SiteConfig, DEFAULT_SITE_ID) is None:
        raise HTTPException(status_code=500, detail="기본 사이트 설정이 없습니다.")
    return DEFAULT_SITE_ID


def _resolve_referrer_id(db: Session, site_id: uuid.UUID, code: Optional[str]) -> Optional[int]:
    """같은 사이트의 `login_id` 한 건이면 역할과 무관하게 추천인으로 허용."""
    raw = (code or "").strip()
    if not raw or raw.upper() == "VVIP":
        return None
    ref = db.scalar(select(User).where(User.site_id == site_id, User.login_id == raw))
    if ref is None:
        raise HTTPException(status_code=400, detail="가입코드(추천인 아이디)를 찾을 수 없습니다.")
    return ref.id


def _issue_player_session(db: Session, user: User) -> LoginResponse:
    site = db.get(SiteConfig, user.site_id)
    if site is None:
        raise HTTPException(status_code=500, detail="Site configuration missing")
    token = create_access_token(
        user_id=user.id,
        role=user.role,
        site_id=str(user.site_id),
    )
    return LoginResponse(
        access_token=token,
        user=_user_public(db, user),
        site=_site_public(site),
    )


def _assign_anonymous_login_id(db: Session) -> str:
    for _ in range(12):
        candidate = "anon_" + secrets.token_hex(4)
        exists = db.scalar(select(User.id).where(User.login_id == candidate))
        if exists is None:
            return candidate
    raise HTTPException(status_code=500, detail="아이디 자동 발급에 실패했습니다. 잠시 후 다시 시도해 주세요.")


@router.post(
    "/register/general",
    response_model=PlayerRegisterResult,
    status_code=201,
    summary="일반 회원가입",
)
def register_general(
    body: PlayerRegisterGeneralBody,
    request: Request,
    db: Session = Depends(get_db),
) -> PlayerRegisterResult:
    client_ip = request.client.host if request.client else "unknown"
    reg = check_register_attempt(client_ip)
    if reg.blocked:
        raise HTTPException(status_code=429, detail=reg.reason or "가입이 제한되었습니다.")

    site_id = _parse_site_id(db, body.site_id)
    referrer_id = _resolve_referrer_id(db, site_id, body.signup_code)

    dup = db.scalar(select(User).where(User.login_id == body.login_id.strip()))
    if dup:
        raise HTTPException(status_code=400, detail="이미 사용 중인 아이디입니다.")

    u = User(
        login_id=body.login_id.strip(),
        display_name=body.nickname.strip(),
        site_id=site_id,
        hashed_password=hash_password(body.password),
        hashed_withdraw_password=hash_password(body.withdraw_password),
        role=USER_ROLE_PLAYER,
        referrer_id=referrer_id,
        is_active=True,
        game_money_balance=Decimal("0"),
        rolling_point_balance=Decimal("0"),
        bank_name=body.bank_name.strip(),
        bank_account=body.bank_account.strip(),
        account_holder=body.account_holder.strip(),
        phone=body.phone.strip(),
        birth_ymd=body.birth_ymd,
        gender=body.gender.strip(),
        telecom_carrier=body.telecom_carrier.strip(),
        telegram_id=(body.telegram_id.strip() if body.telegram_id else None),
    )
    db.add(u)
    db.commit()
    db.refresh(u)

    session = _issue_player_session(db, u)
    AuditService.log(
        db,
        actor=u,
        action="PLAYER_REGISTER_OK",
        target_type="USER",
        target_id=str(u.id),
        note=f"general IP={client_ip}",
        actor_ip=client_ip,
    )
    db.commit()

    touch_player_presence(request, u)
    return PlayerRegisterResult(**session.model_dump(), assigned_login_id=None)


@router.post(
    "/register/anonymous",
    response_model=PlayerRegisterResult,
    status_code=201,
    summary="무기명 회원가입 (아이디 자동 발급)",
)
def register_anonymous(
    body: PlayerRegisterAnonymousBody,
    request: Request,
    db: Session = Depends(get_db),
) -> PlayerRegisterResult:
    client_ip = request.client.host if request.client else "unknown"
    reg = check_register_attempt(client_ip)
    if reg.blocked:
        raise HTTPException(status_code=429, detail=reg.reason or "가입이 제한되었습니다.")

    site_id = _parse_site_id(db, body.site_id)
    referrer_id = _resolve_referrer_id(db, site_id, body.signup_code)
    login_id = _assign_anonymous_login_id(db)

    u = User(
        login_id=login_id,
        display_name=body.nickname.strip(),
        site_id=site_id,
        hashed_password=hash_password(body.password),
        hashed_withdraw_password=hash_password(body.withdraw_password),
        role=USER_ROLE_PLAYER,
        referrer_id=referrer_id,
        is_active=True,
        game_money_balance=Decimal("0"),
        rolling_point_balance=Decimal("0"),
        bank_name=body.bank_name.strip(),
        bank_account=body.bank_account.strip(),
        account_holder=body.account_holder.strip(),
        phone=body.phone.strip(),
        birth_ymd=body.birth_ymd,
        gender=body.gender.strip(),
        telecom_carrier=body.telecom_carrier.strip(),
        telegram_id=(body.telegram_id.strip() if body.telegram_id else None),
    )
    db.add(u)
    db.commit()
    db.refresh(u)

    session = _issue_player_session(db, u)
    AuditService.log(
        db,
        actor=u,
        action="PLAYER_REGISTER_OK",
        target_type="USER",
        target_id=str(u.id),
        note=f"anonymous login_id={login_id}",
        actor_ip=client_ip,
    )
    db.commit()

    touch_player_presence(request, u)
    return PlayerRegisterResult(**session.model_dump(), assigned_login_id=login_id)


_PLAYER_LOGIN_GET_HTML = """<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>로그인 안내</title>
<style>
body{font-family:system-ui,sans-serif;background:#0f1419;color:#e2e8f0;margin:0;padding:1.5rem;max-width:28rem;margin-inline:auto;line-height:1.65;}
h1{font-size:1.15rem;color:#34d399;border-bottom:1px solid #334155;padding-bottom:.5rem;}
p{color:#94a3b8;font-size:.95rem;}
.btn{display:inline-block;margin-top:1rem;padding:.65rem 1.2rem;background:linear-gradient(90deg,#34d399,#22c55e);color:#052e16;border-radius:.75rem;font-weight:600;border:0;cursor:pointer;font-size:.95rem;}
small{display:block;margin-top:1.25rem;color:#64748b;font-size:.78rem;line-height:1.5;}
code{color:#a5b4fc;font-size:.85em;}
</style></head><body>
<h1>웹에서 로그인하는 방법</h1>
<p>이 주소는 <strong>프로그램·앱</strong>이 서버와 통신할 때 쓰는 연결입니다. 주소창에 붙여 넣어서는 로그인되지 않습니다.</p>
<p>사이트 <strong>첫 화면</strong>으로 가서, 상단 <strong>「로그인」</strong>을 누른 뒤 아이디·비밀번호를 입력해 주세요.</p>
<button type="button" class="btn" onclick="if(history.length>1)history.back();else location.href='/'">첫 화면으로</button>
<small>운영 서버에서는 환경변수 <code>GAME_PLATFORM_PLAYER_WEB_HOME_URL</code>을 넣으면 이 안내 대신 메인으로 자동 이동합니다.</small>
</body></html>"""


_DEFAULT_PLAYER_PAGES: Dict[str, str] = {
    "events": "",
    "faq": "",
    "terms": "",
    "domain": "",
    "support": "",
    "mypage_intro": "",
}


@router.get("/public-pages", summary="플레이어 공개 페이지 HTML (site_policies.player_pages)")
def player_public_pages(
    site_id: Optional[str] = Query(None, description="미지정 시 기본 사이트"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    어드민 `site_policies.player_pages` 에 저장된 HTML/문구.
    키가 없으면 빈 문자열로 채워 반환합니다.
    """
    sid = _resolve_site_id_for_public_pages(db, site_id)
    site = db.get(SiteConfig, sid)
    if site is None:
        raise HTTPException(status_code=404, detail="사이트 설정을 찾을 수 없습니다.")
    raw: Dict[str, Any] = {}
    if site.site_policies and isinstance(site.site_policies, dict):
        pp = site.site_policies.get("player_pages")
        if isinstance(pp, dict):
            raw = pp
    pages = dict(_DEFAULT_PLAYER_PAGES)
    for k in _DEFAULT_PLAYER_PAGES:
        v = raw.get(k)
        if isinstance(v, str):
            pages[k] = v
    return {"site_id": str(sid), "pages": pages}


@router.get("/login", include_in_schema=False, response_model=None)
def player_login_get() -> Union[RedirectResponse, HTMLResponse]:
    """주소창 GET으로 열 때 JSON 405 대신 안내 페이지 또는 메인으로 이동."""
    home = (settings.PLAYER_WEB_HOME_URL or "").strip().rstrip("/")
    if home:
        return RedirectResponse(url=f"{home}/?openLogin=1", status_code=302)
    return HTMLResponse(content=_PLAYER_LOGIN_GET_HTML)


@router.post("/login", response_model=LoginResponse, summary="플레이어 로그인")
def player_login(
    body: PlayerLoginBody,
    request: Request,
    db: Session = Depends(get_db),
) -> LoginResponse:
    client_ip = request.client.host if request.client else "unknown"
    verdict = check_login_attempt(
        ip=client_ip,
        login_id=body.login_id.strip(),
        device_uuid=body.device_uuid,
    )
    if verdict.blocked:
        raise HTTPException(status_code=429, detail=verdict.reason or "로그인 제한")

    user = db.scalar(select(User).where(User.login_id == body.login_id.strip()))
    if user is None or not verify_password(body.password, user.hashed_password):
        AuditService.log(
            db,
            actor=None,
            action="PLAYER_LOGIN_FAIL",
            target_type="USER",
            target_id=body.login_id,
            note=f"IP={client_ip}",
        )
        db.commit()
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 일치하지 않습니다.")

    # 회원(플레이어) 전용 — 관리자·총판 계정은 /admin/login 사용
    if user.role != USER_ROLE_PLAYER:
        AuditService.log(
            db,
            actor=None,
            action="PLAYER_LOGIN_FAIL",
            target_type="USER",
            target_id=body.login_id,
            note=f"IP={client_ip} non_player_role={user.role}",
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "이 계정은 메인 사이트(회원) 로그인 대상이 아닙니다. "
                "슈퍼관리자·총판·스태프는 관리자(백오피스) 주소에서 로그인해 주세요."
            ),
        )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="비활성화된 계정입니다.")

    session = _issue_player_session(db, user)
    AuditService.log(
        db,
        actor=user,
        action="PLAYER_LOGIN_OK",
        target_type="USER",
        target_id=str(user.id),
        note=f"IP={client_ip}",
        actor_ip=client_ip,
    )
    db.commit()
    touch_player_presence(request, user)
    return session


@router.get("/me", summary="플레이어 세션")
def player_me(
    request: Request,
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
) -> dict:
    if user.role != USER_ROLE_PLAYER:
        raise HTTPException(status_code=403, detail="플레이어 전용입니다.")
    site = db.get(SiteConfig, user.site_id)
    if site is None:
        raise HTTPException(status_code=500, detail="Site configuration missing")
    touch_player_presence(request, user)
    return {
        "user": _user_public(db, user).model_dump(),
        "site": _site_public(site).model_dump(),
    }


@router.post("/presence", summary="접속 유지(heartbeat) — 관리자 현재 접속자 집계용")
def player_presence_heartbeat(
    request: Request,
    user: User = Depends(get_current_user_from_token),
) -> dict:
    if user.role != USER_ROLE_PLAYER:
        raise HTTPException(status_code=403, detail="플레이어 전용입니다.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="비활성화된 계정입니다.")
    touch_player_presence(request, user)
    return {"ok": True}


class PlayerChangePasswordBody(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=256)
    new_password: str = Field(..., min_length=6, max_length=128)


@router.post("/password", summary="로그인 비밀번호 변경")
def player_change_password(
    body: PlayerChangePasswordBody,
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
) -> dict:
    if user.role != USER_ROLE_PLAYER:
        raise HTTPException(status_code=403, detail="플레이어 전용입니다.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="비활성화된 계정입니다.")
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="현재 비밀번호가 일치하지 않습니다.")
    user.hashed_password = hash_password(body.new_password[:72])
    db.add(user)
    db.commit()
    return {"ok": True}


class PlayerCashRequestBody(BaseModel):
    request_type: str = Field(..., description="DEPOSIT 또는 WITHDRAW")
    amount: str = Field(..., min_length=1, max_length=32)
    memo: Optional[str] = Field(None, max_length=2000)
    withdraw_password: Optional[str] = Field(None, max_length=128, description="출금 시 출금비밀번호")


@router.get("/cash/requests", summary="내 입출금 신청 목록")
def player_list_cash_requests(
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
    limit: int = 30,
) -> dict:
    if user.role != USER_ROLE_PLAYER:
        raise HTTPException(status_code=403, detail="플레이어 전용입니다.")
    rows = list(
        db.scalars(
            select(CashRequest)
            .where(CashRequest.user_id == user.id)
            .order_by(desc(CashRequest.created_at))
            .limit(min(limit, 100))
        ).all()
    )
    return {"items": [cash_request_to_dict(r) for r in rows]}


# 플레이어가 본인 목록에서 지울 수 없는 상태(담당 처리 중만 보호). 승인·거절·대기는 내역 정리용 삭제 허용.
_PLAYER_CASH_DELETE_BLOCKED_STATUSES = frozenset({"PROCESSING"})


@router.delete("/cash/requests/{request_id}", summary="내 입출금 신청 삭제 (처리중 제외)")
async def player_delete_cash_request(
    request_id: int,
    request: Request,
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
) -> dict:
    if user.role != USER_ROLE_PLAYER:
        raise HTTPException(status_code=403, detail="플레이어 전용입니다.")
    row = db.get(CashRequest, request_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="신청 내역을 찾을 수 없습니다.")
    if row.status in _PLAYER_CASH_DELETE_BLOCKED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="처리 중인 신청은 삭제할 수 없습니다. 잠시 후 다시 시도해 주세요.",
        )
    db.delete(row)
    AuditService.log(
        db,
        actor=user,
        action="PLAYER_CASH_REQUEST_DELETE",
        target_type="CASH_REQUEST",
        target_id=str(request_id),
        before={"status": row.status, "amount": str(row.amount)},
        after={},
        actor_ip=request.client.host if request.client else None,
    )
    db.commit()
    await admin_ws_manager.broadcast_event("dashboard_refresh", {})
    return {"ok": True, "deleted_id": request_id}


@router.post("/cash/requests/delete-all", summary="내 입출금 신청 전체 삭제 (처리중 제외)")
async def player_delete_all_cash_requests(
    request: Request,
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
) -> dict:
    if user.role != USER_ROLE_PLAYER:
        raise HTTPException(status_code=403, detail="플레이어 전용입니다.")
    blocked = tuple(_PLAYER_CASH_DELETE_BLOCKED_STATUSES)
    rows = list(
        db.scalars(
            select(CashRequest).where(
                CashRequest.user_id == user.id,
                CashRequest.status.notin_(blocked),
            )
        ).all()
    )
    n = 0
    for row in rows:
        db.delete(row)
        n += 1
    if n:
        AuditService.log(
            db,
            actor=user,
            action="PLAYER_CASH_REQUEST_DELETE_ALL",
            target_type="CASH_REQUEST",
            target_id="*",
            before={"count": n},
            after={},
            actor_ip=request.client.host if request.client else None,
        )
    db.commit()
    if n:
        await admin_ws_manager.broadcast_event("dashboard_refresh", {})
    return {"ok": True, "deleted_count": n}


@router.post("/cash/requests", summary="입금·출금 신청 (본인)")
async def player_create_cash_request(
    body: PlayerCashRequestBody,
    request: Request,
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
) -> dict:
    if user.role != USER_ROLE_PLAYER:
        raise HTTPException(status_code=403, detail="플레이어 전용입니다.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="비활성화된 계정입니다.")
    try:
        amount = Decimal(body.amount.strip())
    except Exception as e:
        raise HTTPException(status_code=400, detail="금액 형식이 올바르지 않습니다.") from e
    if amount <= 0:
        raise HTTPException(status_code=400, detail="0보다 큰 금액을 입력하세요.")

    site_row = db.get(SiteConfig, user.site_id)
    if site_row is None:
        raise HTTPException(status_code=500, detail="site config missing")

    rtype = body.request_type.strip().upper()
    if rtype == "WITHDRAW":
        if user.hashed_withdraw_password:
            if not body.withdraw_password or not verify_password(
                body.withdraw_password, user.hashed_withdraw_password
            ):
                raise HTTPException(status_code=400, detail="출금 비밀번호가 올바르지 않습니다.")

    try:
        assert_cash_request_allowed(
            db,
            site=site_row,
            kind=rtype,
            amount=amount,
            user_id=user.id,
        )
    except SiteCashPolicyError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from e

    if rtype == "DEPOSIT":
        req = CashService.create_deposit_request(db, user_id=user.id, amount=amount, memo=body.memo)
    elif rtype == "WITHDRAW":
        try:
            req = CashService.create_withdraw_request(db, user_id=user.id, amount=amount, memo=body.memo)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
    else:
        raise HTTPException(status_code=400, detail="request_type 은 DEPOSIT 또는 WITHDRAW 입니다.")

    AuditService.log(
        db,
        actor=user,
        action="PLAYER_CASH_REQUEST",
        target_type="CASH_REQUEST",
        target_id=str(req.id),
        after={"type": rtype, "amount": body.amount},
        actor_ip=request.client.host if request.client else None,
    )
    db.commit()

    await admin_ws_manager.broadcast_event(
        "cash_request_new",
        {
            "id": req.id,
            "request_type": rtype,
            "amount": body.amount,
            "user_id": user.id,
            "login_id": user.login_id,
            "source": "player",
        },
    )
    await admin_ws_manager.broadcast_event("dashboard_refresh", {})
    return cash_request_to_dict(req)


class PlayerRollingConvertBody(BaseModel):
    amount: str


@router.post("/wallet/convert-rolling", summary="롤링 포인트 → 게임머니 전환 (플레이어 본인)")
def player_wallet_convert_rolling(
    body: PlayerRollingConvertBody,
    user: User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
) -> dict:
    if user.role != USER_ROLE_PLAYER:
        raise HTTPException(status_code=403, detail="플레이어 전용입니다.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="비활성화된 계정입니다.")
    try:
        amt = Decimal(str(body.amount).strip().replace(",", ""))
    except Exception as e:
        raise HTTPException(status_code=400, detail="금액 형식이 올바르지 않습니다.") from e
    if amt <= 0:
        raise HTTPException(status_code=400, detail="0보다 큰 금액을 입력하세요.")

    u = db.scalars(select(User).where(User.id == user.id).with_for_update()).one_or_none()
    if u is None:
        raise HTTPException(status_code=404, detail="user not found")
    if u.rolling_point_balance < amt:
        raise HTTPException(
            status_code=400,
            detail=f"롤링 포인트가 부족합니다. (보유: {u.rolling_point_balance})",
        )

    q = Decimal("0.000001")
    new_roll = (u.rolling_point_balance - amt).quantize(q)
    new_gm = (u.game_money_balance + amt).quantize(q)
    u.rolling_point_balance = new_roll
    u.game_money_balance = new_gm
    db.add(
        RollingPointLedgerEntry(
            user_id=u.id,
            delta=-amt,
            balance_after=new_roll,
            reason=RollingPointLedgerReason.CONVERT_TO_GAME_MONEY.value,
            reference_type="CONVERT",
            reference_id="rolling_to_gm",
        )
    )
    db.add(
        GameMoneyLedgerEntry(
            user_id=u.id,
            delta=amt,
            balance_after=new_gm,
            reason=GameMoneyLedgerReason.ROLLING_POINT_CONVERT.value,
            reference_type="CONVERT",
            reference_id="rolling_to_gm",
        )
    )
    db.commit()
    db.refresh(u)
    return {
        "ok": True,
        "game_money_balance": str(u.game_money_balance),
        "rolling_point_balance": str(u.rolling_point_balance),
    }


# ---------------------------------------------------------------------------
# (선택) 외부 그누보드 회원 검증 브릿지 로그인 — PLAYER_LOGIN_V6_ENABLED 일 때만
# ---------------------------------------------------------------------------

class V6LoginBody(BaseModel):
    login_id: str
    password: str


@router.post("/login/v6", response_model=LoginResponse, summary="[선택] 외부 보드 회원 브릿지 로그인")
def player_login_v6(
    body: V6LoginBody,
    request: Request,
    db: Session = Depends(get_db),
) -> LoginResponse:
    """
    GAME_PLATFORM_PLAYER_LOGIN_V6_ENABLED=true 일 때만 동작.
    기본값 False — 플레이어는 /api/player/login (gp_users) 사용.
    """
    from app.core.config import settings as _s

    if not _s.PLAYER_LOGIN_V6_ENABLED:
        raise HTTPException(status_code=404, detail="Not Found")

    client_ip = request.client.host if request.client else "unknown"
    login_id = body.login_id.strip()

    # 1) v6 내부 API로 비밀번호 검증
    try:
        resp = httpx.post(
            f"{_s.V6_API_BASE}/api/v1/internal/verify-member",
            json={"login_id": login_id, "password": body.password},
            headers={"X-Internal-Secret": _s.V6_INTERNAL_SECRET},
            timeout=8.0,
        )
        resp.raise_for_status()
        v6_data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"v6 인증 서버 오류: {e}")

    if not v6_data.get("ok"):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 일치하지 않습니다.")

    mb_nick = v6_data.get("mb_nick") or login_id

    # 2) gp_users에서 찾거나 자동 생성
    site_id = DEFAULT_SITE_ID
    user = db.scalar(select(User).where(User.login_id == login_id))
    if user is None:
        safe_pw = body.password[:72]
        user = User(
            login_id=login_id,
            display_name=mb_nick,
            site_id=site_id,
            hashed_password=hash_password(safe_pw),
            hashed_withdraw_password=hash_password("000000"),
            role=USER_ROLE_PLAYER,
            is_active=True,
            game_money_balance=Decimal("0"),
            rolling_point_balance=Decimal("0"),
            bank_name="",
            bank_account="",
            account_holder="",
            phone="",
            birth_ymd="",
            gender="",
            telecom_carrier="",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not user.is_active:
        raise HTTPException(status_code=403, detail="비활성화된 계정입니다.")

    session = _issue_player_session(db, user)
    AuditService.log(
        db,
        actor=user,
        action="PLAYER_LOGIN_V6_OK",
        target_type="USER",
        target_id=str(user.id),
        note=f"IP={client_ip} v6_login",
        actor_ip=client_ip,
    )
    db.commit()
    touch_player_presence(request, user)
    return session
