"""
어드민 REST + WebSocket (총판 트리, 롤링 요율, 입출금, Audit Log, OTP).
"""
from __future__ import annotations

import jwt
import uuid
from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, status
from pydantic import BaseModel
from sqlalchemy import delete, desc, select
from sqlalchemy.orm import Session

from app.constants import (
    USER_ROLE_OWNER,
    USER_ROLE_PLAYER,
    USER_ROLE_STAFF,
    USER_ROLE_SUPER_ADMIN,
)
from app.dependencies.data_scope import FORBIDDEN_USER_DATA, assert_viewer_may_access_target_user
from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.dependencies.auth_jwt import require_admin_user, require_super_admin
from app.models.admin_allowed_ip import AdminAllowedIp
from app.models.audit_log import AuditLog
from app.models.bet import BetHistory
from app.models.cash_request import CashRequest
from app.models.enums import GameMoneyLedgerReason, RollingPointLedgerReason
from app.models.ledger import GameMoneyLedgerEntry, RollingPointLedgerEntry
from app.models.settlement_snapshot import SettlementSnapshot
from app.models.site_config import SiteConfig
from app.models.user import User, UserGameRollingRate
from app.schemas.admin import RollingRatesUpdateBody
from app.schemas.agent import StoreEnabledBody
from app.services.audit_service import AuditService
from app.services.bet_limit_service import (
    GAME_KEYS,
    effective_limits,
    merged_site_limits,
    validate_site_limits_patch,
    validate_user_override_patch,
)
from app.services.bet_history_lines import build_history_lines_for_scope
from app.services.cash_service import CashService, cash_request_to_dict
from app.services.dashboard_stats import get_cash_dashboard_metrics, get_today_totals
from app.services.ledger_labels import label_game_money_reason
from app.services.downline_subtree import (
    downward_subtree_user_ids,
    downward_subtree_users_for_tree,
    sanitize_tree_nodes_for_partner,
)
from app.services.otp_service import generate_secret, get_provisioning_uri, verify_totp
from app.services.partner_utils import user_is_partner
from app.services.risk_engine import check_login_attempt, get_blocked_ips
from app.services.player_presence import ACTIVE_SECONDS as PLAYER_PRESENCE_TTL_SEC
from app.services.player_presence import list_player_presence_rows
from app.services.settlement_reporting import (
    get_rolling_ledger_detail_lines,
    get_rolling_settlement_lines,
)
from app.services.total_revenue_service import get_total_revenue_table
from app.services.site_policy_service import (
    SiteCashPolicyError,
    assert_cash_request_allowed,
    merge_site_policies,
    policies_dict,
)
from app.websockets.manager import admin_ws_manager

router = APIRouter()


async def _broadcast_dashboard_refresh() -> None:
    """클라이언트가 각자 `GET /admin/dashboard/today` 를 다시 불러 스코프 맞는 집계를 쓰도록."""
    await admin_ws_manager.broadcast_event("dashboard_refresh", {})


def _admin_may_access_cash_request_user(db: Session, admin: User, cash_user_id: int) -> None:
    """총판·스태프는 하부 회원 신청만 처리."""
    if admin.role == USER_ROLE_SUPER_ADMIN:
        return
    allowed = downward_subtree_user_ids(db, admin.id)
    if cash_user_id not in allowed:
        raise HTTPException(status_code=403, detail="해당 입출금 신청에 대한 권한이 없습니다.")


def _site_member_admin_flags(db: Session, site_uuid: uuid.UUID) -> tuple[bool, bool]:
    """`site_policies.admin_ui` — (지급·회수 허용, 상세 수정 허용). 키 없으면 True."""
    sc = db.get(SiteConfig, site_uuid)
    if sc is None or not sc.site_policies or not isinstance(sc.site_policies, dict):
        return True, True
    ui = sc.site_policies.get("admin_ui")
    if not isinstance(ui, dict):
        return True, True
    wallet = True if "member_wallet_enabled" not in ui else bool(ui.get("member_wallet_enabled"))
    edit = True if "member_profile_edit_enabled" not in ui else bool(ui.get("member_profile_edit_enabled"))
    return wallet, edit


def _viewer_member_ops_effective(
    db: Session,
    viewer: User,
    target_site_id: uuid.UUID,
) -> tuple[bool, bool, bool]:
    """
    회원을 대상으로 할 때 viewer의 (게임머니 지급, 회수, 상세수정) 가능 여부.
    사이트 `admin_ui` 플래그와 계정별 플래그를 AND.
    슈퍼관리자는 항상 (True, True, True).
    총판·스태프와 동일하게, 롤링 요율로 파트너 콘솔에 들어오는 player 역할도
    `admin_wallet_*` 플래그로 지급·회수 가능(본인 행 포함, 대상 회원 `member_list_wallet_enabled`는 별도 AND).
    역할만 player이고 파트너가 아닌 일반 회원은 (False, False, False).
    """
    if viewer.role == USER_ROLE_SUPER_ADMIN:
        return True, True, True
    w_site, e_site = _site_member_admin_flags(db, target_site_id)
    can_wallet_ops = viewer.role in (USER_ROLE_OWNER, USER_ROLE_STAFF) or (
        viewer.role == USER_ROLE_PLAYER and user_is_partner(db, viewer.id)
    )
    if not can_wallet_ops:
        return False, False, False
    cr = bool(viewer.admin_wallet_credit_enabled)
    db_ = bool(viewer.admin_wallet_debit_enabled)
    ed = bool(viewer.admin_member_profile_edit_enabled)
    return (w_site and cr, w_site and db_, e_site and ed)


def _apply_member_target_wallet_flags(
    viewer: User, target: User, wc: bool, wd: bool
) -> tuple[bool, bool]:
    """대상 회원의 member_list_wallet_enabled — 비슈퍼일 때만 꺼지면 지급·회수 불가. 슈퍼는 항상 viewer 권한 그대로."""
    if viewer.role == USER_ROLE_SUPER_ADMIN:
        return wc, wd
    if not bool(getattr(target, "member_list_wallet_enabled", True)):
        return False, False
    return wc, wd


def _reject_if_partner_limited_ui(user: User, detail: str) -> None:
    """슈퍼가 켠 제한 모드이거나, 요율로 들어온 플레이어(하부 파트너) — 동일 제한."""
    if bool(getattr(user, "admin_partner_limited_ui", False)) or user.role == USER_ROLE_PLAYER:
        raise HTTPException(status_code=403, detail=detail)


def _player_online_rows_for_admin(db: Session, user: User) -> List[Dict[str, Any]]:
    super_admin = user.role == USER_ROLE_SUPER_ADMIN
    if super_admin:
        return list_player_presence_rows(super_admin=True, site_id=None, allowed_user_ids=None)
    subtree = downward_subtree_user_ids(db, user.id)
    return list_player_presence_rows(
        super_admin=False,
        site_id=str(user.site_id),
        allowed_user_ids=subtree,
    )


# ─── Pydantic Request Bodies ──────────────────────────────────────────────────

class CashActionBody(BaseModel):
    reason: Optional[str] = ""


class CashCreateBody(BaseModel):
    user_id: int
    request_type: str  # DEPOSIT / WITHDRAW
    amount: str
    memo: Optional[str] = None


class WalletAdjustBody(BaseModel):
    """게임머니 즉시 조정 (입출금 신청 큐 없이 원장만). direction: credit=지급, debit=회수."""

    direction: str  # credit | debit
    amount: str
    memo: Optional[str] = ""


class AdminUserProfilePatchBody(BaseModel):
    """회원 상세 수정 (슈퍼관리자 전용 API)."""

    display_name: Optional[str] = None
    phone: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    account_holder: Optional[str] = None
    telegram_id: Optional[str] = None
    member_level: Optional[int] = None
    is_active: Optional[bool] = None


class OtpVerifyBody(BaseModel):
    code: str


class ManualBlockBody(BaseModel):
    ip: str
    duration_sec: int = 86400


class SiteBetLimitsPatchBody(BaseModel):
    limits: Dict[str, Any]


class SitePoliciesPatchBody(BaseModel):
    """`site_policies` 상위 키 단위 병합 (deposit / withdraw / maintenance / level_bonuses 등)."""

    policies: Dict[str, Any]


class AdminIpCreateBody(BaseModel):
    ip_pattern: str
    memo: Optional[str] = None


class MemberLevelPatchBody(BaseModel):
    member_level: int


class AdminMemberOpsPatchBody(BaseModel):
    """총판·스태프 계정별 회원목록 지급·회수·상세수정 권한 (사이트 정책과 AND)."""

    admin_wallet_credit_enabled: Optional[bool] = None
    admin_wallet_debit_enabled: Optional[bool] = None
    admin_member_profile_edit_enabled: Optional[bool] = None


class MemberListWalletPatchBody(BaseModel):
    """대상 회원별 — 목록·상세에서 지급·회수 허용(총판·스태프에만 제한, 슈퍼는 항상 가능)."""

    member_list_wallet_enabled: bool


class PartnerLimitedUiPatchBody(BaseModel):
    """슈퍼 전용: 하부 관리자(파트너) 제한 UI 모드."""

    admin_partner_limited_ui: bool


class UserBetLimitsOverridePatchBody(BaseModel):
    overrides: Dict[str, Any]


def _admin_can_view_site_bet_limits(_db: Session, u: User) -> bool:
    """사이트 한도·정책·어드민 IP 등 — 총판·스태프·슈퍼만 (하부 플레이어 제외)."""
    return u.role in (USER_ROLE_SUPER_ADMIN, USER_ROLE_OWNER, USER_ROLE_STAFF)


def _admin_can_patch_site_bet_limits(u: User) -> bool:
    return u.role in (USER_ROLE_SUPER_ADMIN, USER_ROLE_OWNER)


def _verify_ws_token(token: Optional[str]) -> bool:
    if not token or not token.strip():
        return False
    try:
        decode_access_token(token.strip())
        return True
    except jwt.PyJWTError:
        pass
    expected = (settings.ADMIN_API_TOKEN or "").strip()
    return bool(expected and token.strip() == expected)


@router.websocket("/ws")
async def admin_websocket(websocket: WebSocket, token: Optional[str] = Query(None)):
    """모바일/브라우저 호환: `wss://host/admin/ws?token=<JWT>` (레거시: ADMIN_API_TOKEN)."""
    if not _verify_ws_token(token):
        await websocket.close(code=1008)
        return
    await admin_ws_manager.accept_admin(websocket)
    try:
        while True:
            await websocket.receive_text()
    except Exception:
        pass
    finally:
        admin_ws_manager.disconnect(websocket)


@router.get("/dashboard/today", summary="금일 배팅·롤링 집계 + WS 접속 수")
def admin_dashboard_today(
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    super_admin = user.role == USER_ROLE_SUPER_ADMIN
    if super_admin:
        data = dict(
            get_today_totals(
                db,
                site_id=None,
                super_admin=True,
                scope_subtree_user_ids=None,
            )
        )
        data.update(
            get_cash_dashboard_metrics(
                db,
                site_id=None,
                super_admin=True,
                scope_subtree_user_ids=None,
            )
        )
    else:
        subtree = downward_subtree_user_ids(db, user.id)
        data = dict(
            get_today_totals(
                db,
                site_id=user.site_id,
                super_admin=False,
                scope_subtree_user_ids=subtree,
            )
        )
        data.update(
            get_cash_dashboard_metrics(
                db,
                site_id=user.site_id,
                super_admin=False,
                scope_subtree_user_ids=subtree,
            )
        )
    data["admin_ws_connections"] = admin_ws_manager.connection_count()
    online_rows = _player_online_rows_for_admin(db, user)
    data["player_online_count"] = len(online_rows)
    data["player_presence_ttl_sec"] = PLAYER_PRESENCE_TTL_SEC
    vu = db.get(User, user.id)
    if vu is not None:
        data["viewer_game_money_balance"] = str(vu.game_money_balance)
        data["viewer_rolling_point_balance"] = str(vu.rolling_point_balance)
    return data


class RollingConvertBody(BaseModel):
    amount: str


@router.post("/wallet/convert-rolling", summary="본인 롤링 포인트(마일리지) → 게임머니 전환")
def admin_wallet_convert_rolling(
    body: RollingConvertBody,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
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


@router.get("/wallet/rolling-convert-history", summary="본인 포인트→게임머니 전환 내역")
def admin_wallet_rolling_convert_history(
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    limit: int = Query(40, ge=1, le=100),
) -> Dict[str, Any]:
    rows = list(
        db.scalars(
            select(GameMoneyLedgerEntry)
            .where(
                GameMoneyLedgerEntry.user_id == user.id,
                GameMoneyLedgerEntry.reason == GameMoneyLedgerReason.ROLLING_POINT_CONVERT.value,
            )
            .order_by(desc(GameMoneyLedgerEntry.id))
            .limit(limit)
        ).all()
    )
    items = []
    for r in rows:
        items.append(
            {
                "id": r.id,
                "converted_amount": str(r.delta),
                "game_money_balance_after": str(r.balance_after),
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "label": label_game_money_reason(r.reason),
            }
        )
    return {"items": items, "limit": limit}


@router.get("/players/online", summary="플레이어 실시간 접속 목록(최근 API·heartbeat 기준)")
def admin_players_online(
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    rows = _player_online_rows_for_admin(db, user)
    return {
        "items": rows,
        "count": len(rows),
        "ttl_sec": PLAYER_PRESENCE_TTL_SEC,
    }


@router.get(
    "/settlements/total-revenue-table",
    summary="전체 수익 정산판 (직속 하부별, 기간·종목, KST 달력)",
)
def admin_settlements_total_revenue_table(
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    parent_id: int = Query(..., ge=1),
    date_from: date = Query(..., description="시작일 (KST 달력)"),
    date_to: date = Query(..., description="종료일 (KST 달력)"),
    vertical: str = Query("all"),
) -> Dict[str, Any]:
    super_admin = user.role == USER_ROLE_SUPER_ADMIN
    return get_total_revenue_table(
        db,
        admin=user,
        parent_id=parent_id,
        date_from=date_from,
        date_to=date_to,
        super_admin=super_admin,
        site_id=None if super_admin else user.site_id,
        vertical=vertical or "all",
    )


@router.get(
    "/settlements/rolling-lines",
    summary="파트너 롤링 정산 라인 (수령인별 합산, 기간·종목·KST)",
)
def admin_settlement_rolling_lines(
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    date_from: Optional[date] = Query(None, description="시작일 (KST), 미지정 시 오늘"),
    date_to: Optional[date] = Query(None, description="종료일 (KST), 미지정 시 오늘"),
    vertical: str = Query("all", description="casino|slot|powerball|sports|all"),
) -> Dict[str, Any]:
    super_admin = user.role == USER_ROLE_SUPER_ADMIN
    if super_admin:
        return get_rolling_settlement_lines(
            db,
            site_id=None,
            super_admin=True,
            scope_subtree_user_ids=None,
            date_from=date_from,
            date_to=date_to,
            vertical=vertical or "all",
        )
    subtree = downward_subtree_user_ids(db, user.id)
    return get_rolling_settlement_lines(
        db,
        site_id=user.site_id,
        super_admin=False,
        scope_subtree_user_ids=subtree,
        date_from=date_from,
        date_to=date_to,
        vertical=vertical or "all",
    )


@router.get(
    "/settlements/rolling-lines/detail",
    summary="롤링 원장 건별 상세 (수령인·기간·종목)",
)
def admin_settlement_rolling_lines_detail(
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    recipient_user_id: int = Query(..., ge=1),
    date_from: date = Query(..., description="시작일 (KST)"),
    date_to: date = Query(..., description="종료일 (KST)"),
    vertical: str = Query("all", description="casino|slot|powerball|sports|all"),
) -> Dict[str, Any]:
    super_admin = user.role == USER_ROLE_SUPER_ADMIN
    if super_admin:
        return get_rolling_ledger_detail_lines(
            db,
            site_id=None,
            super_admin=True,
            scope_subtree_user_ids=None,
            recipient_user_id=recipient_user_id,
            date_from=date_from,
            date_to=date_to,
            vertical=vertical or "all",
        )
    subtree = downward_subtree_user_ids(db, user.id)
    return get_rolling_ledger_detail_lines(
        db,
        site_id=user.site_id,
        super_admin=False,
        scope_subtree_user_ids=subtree,
        recipient_user_id=recipient_user_id,
        date_from=date_from,
        date_to=date_to,
        vertical=vertical or "all",
    )


@router.get("/bets/history", summary="하향 범위 통합 배팅 로그 (카지노·슬롯·파워볼·토토 game_type)")
def admin_bet_history(
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    login_id: Optional[str] = None,
    game_type: Optional[str] = None,
    game_result: Optional[str] = None,
    min_amount: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    super_admin = user.role == USER_ROLE_SUPER_ADMIN
    stmt = select(BetHistory, User.login_id).join(User, BetHistory.user_id == User.id)
    if not super_admin:
        allowed = downward_subtree_user_ids(db, user.id)
        stmt = stmt.where(BetHistory.user_id.in_(allowed))
    if login_id and login_id.strip():
        stmt = stmt.where(User.login_id.ilike(f"%{login_id.strip()}%"))
    if game_type and game_type.strip():
        stmt = stmt.where(BetHistory.game_type == game_type.strip().upper()[:32])
    if game_result is not None and game_result.strip() != "":
        stmt = stmt.where(BetHistory.game_result == game_result.strip().upper()[:16])
    if min_amount is not None and str(min_amount).strip() != "":
        try:
            lo = Decimal(str(min_amount).strip())
        except Exception:
            raise HTTPException(status_code=400, detail="min_amount must be a number")
        stmt = stmt.where(BetHistory.bet_amount >= lo)

    stmt = stmt.order_by(BetHistory.id.desc()).offset(offset).limit(limit)
    rows = db.execute(stmt).all()
    items: List[Dict[str, Any]] = []
    for bet, lid in rows:
        items.append(
            {
                "id": bet.id,
                "external_bet_uid": bet.external_bet_uid,
                "login_id": lid,
                "user_id": bet.user_id,
                "game_type": bet.game_type,
                "status": bet.status,
                "bet_amount": str(bet.bet_amount),
                "win_amount": str(bet.win_amount) if bet.win_amount is not None else None,
                "game_result": bet.game_result,
                "created_at": bet.created_at.isoformat() if bet.created_at else None,
                "settled_at": bet.settled_at.isoformat() if bet.settled_at else None,
            }
        )
    return {"items": items, "limit": limit, "offset": offset}


@router.get(
    "/bets/history-lines",
    summary="배팅내역 줄 단위 (베팅/당첨/낙첨 · 이전·거래·이후 잔고)",
)
def admin_bet_history_lines(
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    login_id: Optional[str] = None,
    game_type: Optional[str] = None,
    game_result: Optional[str] = None,
    min_amount: Optional[str] = None,
    bet_limit: int = Query(80, ge=1, le=200, description="펼칠 배팅(건) 상한"),
    line_limit: int = Query(200, ge=1, le=500, description="반환 줄 수 상한"),
) -> Dict[str, Any]:
    super_admin = user.role == USER_ROLE_SUPER_ADMIN
    stmt = select(BetHistory).join(User, BetHistory.user_id == User.id)
    if not super_admin:
        allowed = downward_subtree_user_ids(db, user.id)
        stmt = stmt.where(BetHistory.user_id.in_(allowed))
    if login_id and login_id.strip():
        stmt = stmt.where(User.login_id.ilike(f"%{login_id.strip()}%"))
    if game_type and game_type.strip():
        stmt = stmt.where(BetHistory.game_type == game_type.strip().upper()[:32])
    if game_result is not None and game_result.strip() != "":
        stmt = stmt.where(BetHistory.game_result == game_result.strip().upper()[:16])
    if min_amount is not None and str(min_amount).strip() != "":
        try:
            lo = Decimal(str(min_amount).strip())
        except Exception:
            raise HTTPException(status_code=400, detail="min_amount must be a number")
        stmt = stmt.where(BetHistory.bet_amount >= lo)

    stmt = stmt.order_by(BetHistory.id.desc()).limit(bet_limit)
    bets = list(db.scalars(stmt).all())
    lines = build_history_lines_for_scope(db, bets=bets)
    return {
        "items": lines[:line_limit],
        "bet_limit": bet_limit,
        "line_limit": line_limit,
        "returned_lines": min(len(lines), line_limit),
    }


@router.get("/users", summary="하향 범위 회원·계정 목록 (검색·역할·활성 필터)")
def admin_list_users(
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    q: Optional[str] = Query(None, description="login_id 부분 검색"),
    role: Optional[str] = Query(None, description="역할 (예: player, owner)"),
    is_active: Optional[bool] = Query(
        None,
        description="True=활성만, False=비활성(제재)만, 생략=전체",
    ),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    super_admin = user.role == USER_ROLE_SUPER_ADMIN
    stmt = select(User)
    if not super_admin:
        allowed = downward_subtree_user_ids(db, user.id)
        stmt = stmt.where(User.id.in_(allowed))
    if q and q.strip():
        stmt = stmt.where(User.login_id.ilike(f"%{q.strip()}%"))
    if role and role.strip():
        stmt = stmt.where(User.role == role.strip().lower())
    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)
    stmt = stmt.order_by(User.id.desc()).offset(offset).limit(limit)
    rows = list(db.scalars(stmt).all())
    ref_ids = {u.referrer_id for u in rows if u.referrer_id is not None}
    ref_login: Dict[int, str] = {}
    if ref_ids:
        for ru in db.scalars(select(User).where(User.id.in_(ref_ids))).all():
            ref_login[ru.id] = ru.login_id

    def _upline_column_label(site_uuid: uuid.UUID) -> str:
        default = "상위(추천인)"
        sc = db.get(SiteConfig, site_uuid)
        if sc is None or not sc.site_policies or not isinstance(sc.site_policies, dict):
            return default
        ui = sc.site_policies.get("admin_ui")
        if isinstance(ui, dict):
            v = (ui.get("member_upline_label") or "").strip()
            if v:
                return v
        return default

    items: List[Dict[str, Any]] = []
    for u in rows:
        wc, wd, _ce_site = _viewer_member_ops_effective(db, user, u.site_id)
        wc, wd = _apply_member_target_wallet_flags(user, u, wc, wd)
        can_e = user.role == USER_ROLE_SUPER_ADMIN
        items.append(
            {
                "id": u.id,
                "login_id": u.login_id,
                "display_name": u.display_name,
                "role": u.role,
                "site_id": str(u.site_id),
                "game_money_balance": str(u.game_money_balance),
                "rolling_point_balance": str(u.rolling_point_balance),
                "is_active": u.is_active,
                "is_store_enabled": u.is_store_enabled,
                "referrer_id": u.referrer_id,
                "referrer_login_id": ref_login.get(u.referrer_id) if u.referrer_id else None,
                "member_level": int(u.member_level or 1),
                "member_list_wallet_enabled": bool(u.member_list_wallet_enabled),
                "can_wallet_credit": wc,
                "can_wallet_debit": wd,
                "can_wallet_adjust": wc or wd,
                "can_edit_profile": can_e,
            }
        )
    meta = {"upline_column_label": _upline_column_label(user.site_id)}
    return {"items": items, "limit": limit, "offset": offset, "member_list_meta": meta}


@router.get("/staff/member-ops", summary="총판·스태프별 회원목록 지급·회수·상세수정 권한 목록")
def admin_list_staff_member_ops(
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    site_id: Optional[str] = Query(None, description="슈퍼만: 대상 사이트 UUID. 비우면 본인 소속 사이트"),
) -> Dict[str, Any]:
    if user.role == USER_ROLE_SUPER_ADMIN:
        if site_id and site_id.strip():
            try:
                sid = uuid.UUID(site_id.strip())
            except ValueError as e:
                raise HTTPException(status_code=400, detail="site_id 형식이 올바르지 않습니다.") from e
        else:
            sid = user.site_id
    else:
        if site_id and site_id.strip():
            raise HTTPException(status_code=403, detail="site_id 는 슈퍼관리자만 지정할 수 있습니다.")
        sid = user.site_id

    stmt = select(User).where(
        User.site_id == sid,
        User.role.in_((USER_ROLE_OWNER, USER_ROLE_STAFF)),
    )
    if user.role != USER_ROLE_SUPER_ADMIN:
        allowed = downward_subtree_user_ids(db, user.id)
        stmt = stmt.where(User.id.in_(allowed))
    stmt = stmt.order_by(User.id.desc())
    rows = list(db.scalars(stmt).all())
    return {
        "items": [
            {
                "id": u.id,
                "login_id": u.login_id,
                "display_name": u.display_name,
                "role": u.role,
                "referrer_id": u.referrer_id,
                "admin_wallet_credit_enabled": bool(u.admin_wallet_credit_enabled),
                "admin_wallet_debit_enabled": bool(u.admin_wallet_debit_enabled),
                "admin_member_profile_edit_enabled": bool(u.admin_member_profile_edit_enabled),
            }
            for u in rows
        ],
        "site_id": str(sid),
    }


@router.patch("/users/{user_id}/admin-member-ops", summary="총판·스태프 계정의 회원목록 권한 플래그")
def admin_patch_staff_member_ops(
    user_id: int,
    body: AdminMemberOpsPatchBody,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")
    assert_viewer_may_access_target_user(db, user, user_id)
    if target.role not in (USER_ROLE_OWNER, USER_ROLE_STAFF):
        raise HTTPException(status_code=400, detail="총판·스태프 계정만 설정할 수 있습니다.")
    if user.role != USER_ROLE_SUPER_ADMIN:
        if target.site_id != user.site_id:
            raise HTTPException(status_code=403, detail="다른 사이트 계정입니다.")
        allowed = downward_subtree_user_ids(db, user.id)
        if user_id not in allowed:
            raise HTTPException(status_code=403, detail="하위 조직의 계정만 변경할 수 있습니다.")

    data = body.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="변경할 항목이 없습니다.")
    if "admin_wallet_credit_enabled" in data:
        target.admin_wallet_credit_enabled = bool(data["admin_wallet_credit_enabled"])
    if "admin_wallet_debit_enabled" in data:
        target.admin_wallet_debit_enabled = bool(data["admin_wallet_debit_enabled"])
    if "admin_member_profile_edit_enabled" in data:
        target.admin_member_profile_edit_enabled = bool(data["admin_member_profile_edit_enabled"])
    db.commit()
    db.refresh(target)
    return {
        "id": target.id,
        "login_id": target.login_id,
        "admin_wallet_credit_enabled": target.admin_wallet_credit_enabled,
        "admin_wallet_debit_enabled": target.admin_wallet_debit_enabled,
        "admin_member_profile_edit_enabled": target.admin_member_profile_edit_enabled,
    }


@router.patch(
    "/users/{user_id}/member-list-wallet",
    summary="회원별 목록·상세 지급·회수 허용 (슈퍼·총판·스태프, 하향 범위만)",
)
def patch_member_list_wallet_enabled(
    user_id: int,
    body: MemberListWalletPatchBody,
    user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if user.role not in (USER_ROLE_SUPER_ADMIN, USER_ROLE_OWNER, USER_ROLE_STAFF):
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")
    assert_viewer_may_access_target_user(db, user, user_id)
    target.member_list_wallet_enabled = bool(body.member_list_wallet_enabled)
    AuditService.log(
        db,
        actor=user,
        action="MEMBER_LIST_WALLET_FLAG",
        target_type="USER",
        target_id=str(target.id),
        note=f"member_list_wallet_enabled={target.member_list_wallet_enabled}",
    )
    db.commit()
    db.refresh(target)
    return {"id": target.id, "member_list_wallet_enabled": target.member_list_wallet_enabled}


@router.patch(
    "/users/{user_id}/partner-limited-ui",
    summary="슈퍼: 하부 관리자(파트너) 제한 UI — 좁은 메뉴·비밀번호만·요율 조정 불가",
)
def patch_partner_limited_ui(
    user_id: int,
    body: PartnerLimitedUiPatchBody,
    user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if user.role != USER_ROLE_SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="슈퍼관리자만 변경할 수 있습니다.")
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")
    assert_viewer_may_access_target_user(db, user, user_id)
    target.admin_partner_limited_ui = bool(body.admin_partner_limited_ui)
    AuditService.log(
        db,
        actor=user,
        action="PARTNER_LIMITED_UI",
        target_type="USER",
        target_id=str(target.id),
        note=f"admin_partner_limited_ui={target.admin_partner_limited_ui}",
    )
    db.commit()
    db.refresh(target)
    return {"id": target.id, "admin_partner_limited_ui": target.admin_partner_limited_ui}


def _admin_user_profile_payload(db: Session, viewer: User, target: User) -> Dict[str, Any]:
    ref_login: Optional[str] = None
    if target.referrer_id is not None:
        ref = db.get(User, target.referrer_id)
        ref_login = ref.login_id if ref else None
    wc, wd, _ce_site = _viewer_member_ops_effective(db, viewer, target.site_id)
    wc, wd = _apply_member_target_wallet_flags(viewer, target, wc, wd)
    # 회원 프로필·상세 필드 수정은 슈퍼관리자만 (총판·스태프는 조회·지급·회수·롤링 등만)
    can_e = viewer.role == USER_ROLE_SUPER_ADMIN
    return {
        "id": target.id,
        "login_id": target.login_id,
        "display_name": target.display_name,
        "role": target.role,
        "site_id": str(target.site_id),
        "game_money_balance": str(target.game_money_balance),
        "rolling_point_balance": str(target.rolling_point_balance),
        "is_active": target.is_active,
        "is_store_enabled": target.is_store_enabled,
        "referrer_id": target.referrer_id,
        "referrer_login_id": ref_login,
        "member_level": int(target.member_level or 1),
        "member_list_wallet_enabled": bool(target.member_list_wallet_enabled),
        "phone": target.phone,
        "bank_name": target.bank_name,
        "bank_account": target.bank_account,
        "account_holder": target.account_holder,
        "telegram_id": target.telegram_id,
        "admin_partner_limited_ui": bool(getattr(target, "admin_partner_limited_ui", False)),
        "permissions": {
            "can_wallet_credit": wc,
            "can_wallet_debit": wd,
            "can_wallet_adjust": wc or wd,
            "can_edit_profile": can_e,
        },
    }


@router.get("/users/{user_id}/profile", summary="회원 상세 (직속 상위·잔고·연락처 등)")
def admin_user_profile(
    user_id: int,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")
    assert_viewer_may_access_target_user(db, user, user_id)
    return _admin_user_profile_payload(db, user, target)


@router.patch("/users/{user_id}/profile", summary="회원 상세 수정 (슈퍼관리자 전용)")
def admin_user_profile_patch(
    user_id: int,
    body: AdminUserProfilePatchBody,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    data = body.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="수정할 항목이 없습니다.")
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")
    assert_viewer_may_access_target_user(db, user, user_id)
    if user.role != USER_ROLE_SUPER_ADMIN:
        raise HTTPException(
            status_code=403,
            detail="회원 프로필·상세 정보 수정은 슈퍼관리자만 가능합니다.",
        )

    def _clip_str(val: Any, max_len: int) -> Optional[str]:
        if val is None:
            return None
        s = str(val).strip()
        if not s:
            return None
        return s[:max_len]

    before = {
        "display_name": target.display_name,
        "phone": target.phone,
        "bank_name": target.bank_name,
        "bank_account": target.bank_account,
        "account_holder": target.account_holder,
        "telegram_id": target.telegram_id,
        "member_level": int(target.member_level or 1),
        "is_active": target.is_active,
    }
    after = dict(before)

    if "display_name" in data:
        target.display_name = _clip_str(data["display_name"], 128)
        after["display_name"] = target.display_name
    if "phone" in data:
        target.phone = _clip_str(data["phone"], 32)
        after["phone"] = target.phone
    if "bank_name" in data:
        target.bank_name = _clip_str(data["bank_name"], 64)
        after["bank_name"] = target.bank_name
    if "bank_account" in data:
        target.bank_account = _clip_str(data["bank_account"], 128)
        after["bank_account"] = target.bank_account
    if "account_holder" in data:
        target.account_holder = _clip_str(data["account_holder"], 64)
        after["account_holder"] = target.account_holder
    if "telegram_id" in data:
        target.telegram_id = _clip_str(data["telegram_id"], 64)
        after["telegram_id"] = target.telegram_id
    if "member_level" in data and data["member_level"] is not None:
        ml = int(data["member_level"])
        if ml < 1 or ml > 99:
            raise HTTPException(status_code=400, detail="member_level 은 1~99 입니다.")
        if target.role != USER_ROLE_PLAYER:
            raise HTTPException(status_code=400, detail="플레이어 회원만 레벨을 변경할 수 있습니다.")
        target.member_level = ml
        after["member_level"] = target.member_level
    if "is_active" in data and data["is_active"] is not None:
        target.is_active = bool(data["is_active"])
        after["is_active"] = target.is_active

    AuditService.log(
        db,
        actor=user,
        action="USER_PROFILE_PATCH",
        target_type="USER",
        target_id=str(target.id),
        before=before,
        after=after,
        actor_ip=request.client.host if request and request.client else None,
    )
    db.commit()
    db.refresh(target)
    return _admin_user_profile_payload(db, user, target)


@router.post("/users/{user_id}/wallet/adjust", summary="게임머니 즉시 지급(credit)/회수(debit)")
async def admin_user_wallet_adjust(
    user_id: int,
    body: WalletAdjustBody,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    assert_viewer_may_access_target_user(db, user, user_id)
    pre = db.get(User, user_id)
    if pre is None:
        raise HTTPException(status_code=404, detail="user not found")
    if user.role != USER_ROLE_SUPER_ADMIN and not bool(pre.member_list_wallet_enabled):
        raise HTTPException(
            status_code=403,
            detail="이 회원은 지급·회수 대상에서 제외되어 있습니다.",
        )
    direction = (body.direction or "").strip().lower()
    if direction not in ("credit", "debit"):
        raise HTTPException(status_code=400, detail="direction must be credit or debit")
    wc, wd, _ = _viewer_member_ops_effective(db, user, pre.site_id)
    if direction == "credit" and not wc:
        raise HTTPException(
            status_code=403,
            detail="게임머니 지급 권한이 없습니다. (사이트 정책 또는 본인 계정 설정)",
        )
    if direction == "debit" and not wd:
        raise HTTPException(
            status_code=403,
            detail="게임머니 회수 권한이 없습니다. (사이트 정책 또는 본인 계정 설정)",
        )
    _admin_may_access_cash_request_user(db, user, user_id)
    try:
        amt = Decimal(str(body.amount).strip())
    except Exception as e:
        raise HTTPException(status_code=400, detail="amount must be a valid number") from e
    if amt <= 0:
        raise HTTPException(status_code=400, detail="amount must be positive")

    target = db.scalars(select(User).where(User.id == user_id).with_for_update()).one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")

    old_bal = target.game_money_balance
    if direction == "credit":
        delta = amt
        reason = GameMoneyLedgerReason.ADMIN_CREDIT.value
    else:
        if target.game_money_balance < amt:
            raise HTTPException(
                status_code=400,
                detail=f"잔고 부족 (보유: {target.game_money_balance})",
            )
        delta = -amt
        reason = GameMoneyLedgerReason.ADMIN_DEBIT.value

    new_bal = (target.game_money_balance + delta).quantize(Decimal("0.000001"))
    target.game_money_balance = new_bal
    db.add(
        GameMoneyLedgerEntry(
            user_id=target.id,
            delta=delta,
            balance_after=new_bal,
            reason=reason,
            reference_type="ADMIN_WALLET",
            reference_id=f"actor:{user.id}",
        )
    )
    AuditService.log(
        db,
        actor=user,
        action="WALLET_ADJUST",
        target_type="USER",
        target_id=str(target.id),
        before={"game_money_balance": str(old_bal)},
        after={
            "game_money_balance": str(new_bal),
            "direction": direction,
            "amount": str(amt),
            "memo": (body.memo or "")[:500],
        },
        actor_ip=request.client.host if request and request.client else None,
    )
    db.commit()
    db.refresh(target)
    await _broadcast_dashboard_refresh()
    return {
        "ok": True,
        "user_id": target.id,
        "game_money_balance": str(target.game_money_balance),
    }


@router.get("/agents/tree", summary="추천인 네트워크 트리 (하향 전용)")
def get_agent_tree(
    root_id: int = Query(..., description="트리 루트 유저 ID (비-슈퍼는 본인 id와 동일해야 함)"),
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    super_admin = user.role == USER_ROLE_SUPER_ADMIN
    if not super_admin:
        if root_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=FORBIDDEN_USER_DATA,
            )
    effective_root = root_id
    root = db.get(User, effective_root)
    if root is None:
        raise HTTPException(status_code=404, detail="root user not found")
    if not super_admin and root.site_id != user.site_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=FORBIDDEN_USER_DATA,
        )

    site_key = str(root.site_id)
    raw = downward_subtree_users_for_tree(
        db,
        effective_root,
        site_id_filter=site_key,
        super_admin=super_admin,
    )
    if super_admin:
        id_set = {int(r["id"]) for r in raw}
        nodes: list = []
        for r in raw:
            rid = r.get("referrer_id")
            rid_i = int(rid) if rid is not None else None
            pid = rid_i if rid_i is not None and rid_i in id_set else None
            nodes.append(
                {
                    "id": int(r["id"]),
                    "login_id": r["login_id"],
                    "depth": int(r["depth"]),
                    "game_money_balance": r["game_money_balance"],
                    "rolling_point_balance": r["rolling_point_balance"],
                    "referrer_id": rid_i,
                    "parent_id": pid,
                }
            )
    else:
        nodes = sanitize_tree_nodes_for_partner(raw, root_id=effective_root)

    return {"root_id": effective_root, "nodes": nodes}


@router.get("/users/{user_id}/rolling-rates", summary="유저별 게임 롤링 요율 목록")
def list_user_rolling_rates(
    user_id: int,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")
    assert_viewer_may_access_target_user(db, user, user_id)
    rows = db.scalars(
        select(UserGameRollingRate).where(UserGameRollingRate.user_id == user_id)
    ).all()
    return {
        "user_id": user_id,
        "rates": [
            {
                "game_type": r.game_type,
                "rolling_rate_percent": str(r.rolling_rate_percent),
                "losing_rate_percent": str(r.losing_rate_percent),
            }
            for r in rows
        ],
    }


@router.put("/users/{user_id}/rolling-rates", summary="유저별 게임 롤링 요율 일괄 갱신")
def replace_user_rolling_rates(
    user_id: int,
    body: RollingRatesUpdateBody,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")
    assert_viewer_may_access_target_user(db, user, user_id)
    _reject_if_partner_limited_ui(
        user,
        "하부 관리자 모드에서는 요율을 조정할 수 없습니다. 조회만 가능합니다.",
    )
    if user.role not in (USER_ROLE_SUPER_ADMIN, USER_ROLE_OWNER, USER_ROLE_STAFF):
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
    if target.role != USER_ROLE_PLAYER:
        raise HTTPException(status_code=403, detail="플레이어 회원만 요율을 변경할 수 있습니다.")

    if user.role != USER_ROLE_SUPER_ADMIN and target.id != user.id:
        cap_rows = db.scalars(
            select(UserGameRollingRate).where(UserGameRollingRate.user_id == user.id)
        ).all()
        cap_roll = {r.game_type.strip().upper(): Decimal(str(r.rolling_rate_percent)) for r in cap_rows}
        cap_lose = {r.game_type.strip().upper(): Decimal(str(r.losing_rate_percent)) for r in cap_rows}
        for item in body.rates:
            gt = item.game_type.strip().upper()[:32]
            roll = Decimal(item.rolling_rate_percent).quantize(Decimal("0.0001"))
            lose = Decimal(item.losing_rate_percent).quantize(Decimal("0.0001"))
            cr = cap_roll.get(gt, Decimal("0"))
            cl = cap_lose.get(gt, Decimal("0"))
            if roll > cr:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"하부 롤링 요율은 나의 롤링({cr}%)을 초과할 수 없습니다 ({gt})"
                    ),
                )
            if lose > cl:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"하부 루징 요율은 나의 루징({cl}%)을 초과할 수 없습니다 ({gt})"
                    ),
                )

    db.execute(delete(UserGameRollingRate).where(UserGameRollingRate.user_id == user_id))
    for item in body.rates:
        roll = Decimal(item.rolling_rate_percent).quantize(Decimal("0.0001"))
        lose = Decimal(item.losing_rate_percent).quantize(Decimal("0.0001"))
        db.add(
            UserGameRollingRate(
                user_id=user_id,
                game_type=item.game_type.strip().upper()[:32],
                rolling_rate_percent=roll,
                losing_rate_percent=lose,
            )
        )
    db.commit()
    return {"user_id": user_id, "updated": len(body.rates)}


@router.get("/site/bet-limits", summary="사이트 종목별 배팅 한도(합쳐진 값)")
def get_site_bet_limits(
    site_id: Optional[str] = Query(None, description="슈퍼만 다른 site_id UUID"),
    user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if not _admin_can_view_site_bet_limits(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="배팅 한도 조회 권한이 없습니다.",
        )
    if user.role == USER_ROLE_SUPER_ADMIN:
        try:
            sid = uuid.UUID(site_id.strip()) if site_id and site_id.strip() else user.site_id
        except ValueError as e:
            raise HTTPException(status_code=400, detail="site_id 가 올바른 UUID 가 아닙니다.") from e
    else:
        sid = user.site_id
        if site_id and site_id.strip() and site_id.strip() != str(sid):
            raise HTTPException(status_code=403, detail="타 사이트 한도는 조회할 수 없습니다.")
    site = db.get(SiteConfig, sid)
    if site is None:
        raise HTTPException(status_code=404, detail="site not found")
    return {"site_id": str(sid), "limits": merged_site_limits(site)}


@router.patch("/site/bet-limits", summary="사이트 종목별 배팅 한도 (슈퍼·총판)")
def patch_site_bet_limits(
    body: SiteBetLimitsPatchBody,
    site_id: Optional[str] = Query(None, description="슈퍼만 다른 site_id"),
    user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if not _admin_can_patch_site_bet_limits(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="사이트 한도 수정은 슈퍼관리자 또는 총판(owner)만 가능합니다.",
        )
    if user.role == USER_ROLE_SUPER_ADMIN:
        try:
            sid = uuid.UUID(site_id.strip()) if site_id and site_id.strip() else user.site_id
        except ValueError as e:
            raise HTTPException(status_code=400, detail="site_id 가 올바른 UUID 가 아닙니다.") from e
    else:
        sid = user.site_id
        if site_id and site_id.strip() and site_id.strip() != str(sid):
            raise HTTPException(status_code=403, detail="타 사이트 한도는 수정할 수 없습니다.")
    site = db.get(SiteConfig, sid)
    if site is None:
        raise HTTPException(status_code=404, detail="site not found")
    try:
        pat = validate_site_limits_patch(body.limits)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    base: Dict[str, Any] = dict(site.bet_limits) if isinstance(site.bet_limits, dict) else {}
    for k, v in pat.items():
        base[k] = v
    site.bet_limits = base or None
    db.commit()
    db.refresh(site)
    return {"site_id": str(sid), "limits": merged_site_limits(site)}


@router.get("/site/policies", summary="사이트 운영 정책(JSON) — 점검·충환 시간·금액·레벨 보너스 등")
def get_site_policies(
    site_id: Optional[str] = Query(None, description="슈퍼만 다른 site_id UUID"),
    user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if not _admin_can_view_site_bet_limits(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="사이트 정책 조회는 슈퍼/총판/스태프만 가능합니다.",
        )
    if user.role == USER_ROLE_SUPER_ADMIN:
        try:
            sid = uuid.UUID(site_id.strip()) if site_id and site_id.strip() else user.site_id
        except ValueError as e:
            raise HTTPException(status_code=400, detail="site_id 가 올바른 UUID 가 아닙니다.") from e
    else:
        sid = user.site_id
        if site_id and site_id.strip() and site_id.strip() != str(sid):
            raise HTTPException(status_code=403, detail="타 사이트 정책은 조회할 수 없습니다.")
    site = db.get(SiteConfig, sid)
    if site is None:
        raise HTTPException(status_code=404, detail="site not found")
    return {"site_id": str(sid), "policies": policies_dict(site)}


@router.patch("/site/policies", summary="사이트 운영 정책 병합 저장 (슈퍼·총판)")
def patch_site_policies(
    body: SitePoliciesPatchBody,
    site_id: Optional[str] = Query(None, description="슈퍼만 다른 site_id"),
    user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if not _admin_can_patch_site_bet_limits(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="사이트 정책 수정은 슈퍼관리자 또는 총판(owner)만 가능합니다.",
        )
    if user.role == USER_ROLE_SUPER_ADMIN:
        try:
            sid = uuid.UUID(site_id.strip()) if site_id and site_id.strip() else user.site_id
        except ValueError as e:
            raise HTTPException(status_code=400, detail="site_id 가 올바른 UUID 가 아닙니다.") from e
    else:
        sid = user.site_id
        if site_id and site_id.strip() and site_id.strip() != str(sid):
            raise HTTPException(status_code=403, detail="타 사이트 정책은 수정할 수 없습니다.")
    site = db.get(SiteConfig, sid)
    if site is None:
        raise HTTPException(status_code=404, detail="site not found")
    merged = merge_site_policies(policies_dict(site), body.policies)
    site.site_policies = merged or None
    db.commit()
    db.refresh(site)
    return {"site_id": str(sid), "policies": policies_dict(site)}


def _site_tool_target_id(user: User, site_id: Optional[str]) -> uuid.UUID:
    if user.role == USER_ROLE_SUPER_ADMIN:
        try:
            return uuid.UUID(site_id.strip()) if site_id and site_id.strip() else user.site_id
        except ValueError as e:
            raise HTTPException(status_code=400, detail="site_id 가 올바른 UUID 가 아닙니다.") from e
    sid = user.site_id
    if site_id and site_id.strip() and site_id.strip() != str(sid):
        raise HTTPException(status_code=403, detail="타 사이트는 사용할 수 없습니다.")
    return sid


@router.get("/site/admin-ips", summary="어드민 허용 IP 목록")
def list_admin_allowed_ips(
    site_id: Optional[str] = Query(None, description="슈퍼만 다른 site_id"),
    user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if not _admin_can_view_site_bet_limits(db, user):
        raise HTTPException(status_code=403, detail="조회 권한이 없습니다.")
    sid = _site_tool_target_id(user, site_id)
    rows = list(
        db.scalars(
            select(AdminAllowedIp).where(AdminAllowedIp.site_id == sid).order_by(AdminAllowedIp.id.desc())
        ).all()
    )
    return {
        "site_id": str(sid),
        "items": [
            {
                "id": r.id,
                "ip_pattern": r.ip_pattern,
                "memo": r.memo,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


@router.post("/site/admin-ips", summary="어드민 허용 IP 추가")
def create_admin_allowed_ip(
    body: AdminIpCreateBody,
    site_id: Optional[str] = Query(None, description="슈퍼만 다른 site_id"),
    user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if not _admin_can_patch_site_bet_limits(user):
        raise HTTPException(status_code=403, detail="추가는 슈퍼·총판만 가능합니다.")
    sid = _site_tool_target_id(user, site_id)
    pat = (body.ip_pattern or "").strip()
    if not pat:
        raise HTTPException(status_code=400, detail="ip_pattern 이 필요합니다.")
    row = AdminAllowedIp(site_id=sid, ip_pattern=pat[:80], memo=(body.memo or "")[:256] or None)
    db.add(row)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="중복 IP 이거나 저장에 실패했습니다.") from e
    db.refresh(row)
    return {
        "id": row.id,
        "ip_pattern": row.ip_pattern,
        "memo": row.memo,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.delete("/site/admin-ips/{row_id}", summary="어드민 허용 IP 삭제")
def delete_admin_allowed_ip(
    row_id: int,
    site_id: Optional[str] = Query(None, description="슈퍼만 다른 site_id"),
    user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    if not _admin_can_patch_site_bet_limits(user):
        raise HTTPException(status_code=403, detail="삭제는 슈퍼·총판만 가능합니다.")
    sid = _site_tool_target_id(user, site_id)
    row = db.get(AdminAllowedIp, row_id)
    if row is None or row.site_id != sid:
        raise HTTPException(status_code=404, detail="not found")
    db.delete(row)
    db.commit()
    return {"status": "deleted"}


@router.get("/users/{user_id}/bet-limits", summary="회원 배팅 한도(오버라이드·적용값)")
def get_user_bet_limits(
    user_id: int,
    user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")
    assert_viewer_may_access_target_user(db, user, user_id)
    if not _admin_can_view_site_bet_limits(db, user):
        raise HTTPException(status_code=403, detail="배팅 한도 조회 권한이 없습니다.")
    site = db.get(SiteConfig, target.site_id)
    eff: Dict[str, Any] = {}
    for gk in sorted(GAME_KEYS):
        mn, mx = effective_limits(site, target, gk)
        eff[gk] = {"min_bet": str(mn), "max_bet": str(mx)}
    return {
        "user_id": user_id,
        "login_id": target.login_id,
        "role": target.role,
        "member_level": int(target.member_level or 1),
        "override": target.bet_limits_override if isinstance(target.bet_limits_override, dict) else {},
        "site_limits": merged_site_limits(site),
        "effective": eff,
    }


@router.patch("/users/{user_id}/member-level", summary="플레이어 회원 레벨 (슈퍼관리자 전용)")
def patch_user_member_level(
    user_id: int,
    body: MemberLevelPatchBody,
    user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")
    assert_viewer_may_access_target_user(db, user, user_id)
    if user.role != USER_ROLE_SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="회원 레벨 변경은 슈퍼관리자만 가능합니다.")
    if target.role != USER_ROLE_PLAYER:
        raise HTTPException(status_code=400, detail="플레이어 회원만 레벨을 설정할 수 있습니다.")
    if body.member_level < 1 or body.member_level > 99:
        raise HTTPException(status_code=400, detail="member_level 은 1~99 입니다.")
    target.member_level = int(body.member_level)
    db.commit()
    db.refresh(target)
    return {"user_id": user_id, "member_level": target.member_level}


@router.patch("/users/{user_id}/bet-limits", summary="회원별 한도 오버라이드 (하위 트리, 슈퍼·총판·스태프)")
def patch_user_bet_limits(
    user_id: int,
    body: UserBetLimitsOverridePatchBody,
    user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")
    assert_viewer_may_access_target_user(db, user, user_id)
    if user.role not in (USER_ROLE_SUPER_ADMIN, USER_ROLE_OWNER, USER_ROLE_STAFF):
        raise HTTPException(status_code=403, detail="회원 한도 수정 권한이 없습니다.")
    site = db.get(SiteConfig, target.site_id)
    if site is None:
        raise HTTPException(status_code=500, detail="site not found")
    if not body.overrides:
        target.bet_limits_override = None
    else:
        ex = dict(target.bet_limits_override or {}) if isinstance(target.bet_limits_override, dict) else {}
        for gk, block in body.overrides.items():
            key = str(gk).strip().upper()
            if key not in GAME_KEYS:
                continue
            if not isinstance(block, dict):
                continue
            inner = dict(ex.get(key, {}))
            for fld in ("min_bet", "max_bet"):
                if fld not in block:
                    continue
                val = block[fld]
                if val is None or (isinstance(val, str) and not val.strip()):
                    inner.pop(fld, None)
                else:
                    inner[fld] = val
            if inner:
                ex[key] = inner
            else:
                ex.pop(key, None)
        try:
            merged_o = validate_user_override_patch(site, target, ex)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        target.bet_limits_override = merged_o
    db.commit()
    db.refresh(target)
    return {
        "user_id": user_id,
        "override": target.bet_limits_override if isinstance(target.bet_limits_override, dict) else {},
    }


@router.patch(
    "/users/{user_id}/store-enabled",
    summary="오프라인 매장 스위치 (슈퍼관리자 전용)",
)
def patch_user_store_enabled(
    user_id: int,
    body: StoreEnabledBody,
    _admin=Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")
    target.is_store_enabled = bool(body.is_store_enabled)
    db.commit()
    db.refresh(target)
    return {
        "user_id": target.id,
        "login_id": target.login_id,
        "is_store_enabled": target.is_store_enabled,
    }


@router.post("/debug/ping-broadcast", summary="WS 브로드캐스트 테스트")
async def debug_broadcast(_user=Depends(require_admin_user)) -> Dict[str, str]:
    await admin_ws_manager.broadcast_event(
        "dashboard_tick",
        {"message": "ping", "source": "admin_debug"},
    )
    return {"status": "sent"}


# ═══════════════════════════════════════════════════════════════════════════════
# E3: 입출금 신청 관리
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/cash/requests", summary="입출금 신청 목록 (PENDING 우선)")
def list_cash_requests(
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    req_status: Optional[str] = Query(None, alias="status"),
    request_type: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    sort: Optional[str] = Query(
        None,
        description="recent=접수시간 최근순(최근충전·환전내역). 미지정 시 상태 우선 정렬(콘솔 대기열용)",
    ),
) -> Dict[str, Any]:
    super_admin = user.role == USER_ROLE_SUPER_ADMIN
    stmt = select(CashRequest, User.login_id).join(User, CashRequest.user_id == User.id)
    if not super_admin:
        allowed = downward_subtree_user_ids(db, user.id)
        stmt = stmt.where(CashRequest.user_id.in_(allowed))
    if req_status:
        st = req_status.upper()
        # UI「대기」탭: 신규(PENDING) + 담당자 확인 중(PROCESSING) 함께 표시
        if st == "PENDING":
            stmt = stmt.where(CashRequest.status.in_(("PENDING", "PROCESSING")))
        else:
            stmt = stmt.where(CashRequest.status == st)
    if request_type:
        stmt = stmt.where(CashRequest.request_type == request_type.upper())
    if (sort or "").strip().lower() == "recent":
        stmt = stmt.order_by(CashRequest.created_at.desc())
    else:
        stmt = stmt.order_by(CashRequest.status.asc(), CashRequest.created_at.desc())
    stmt = stmt.offset(offset).limit(limit)
    rows = db.execute(stmt).all()
    items = []
    for req, login_id in rows:
        d = cash_request_to_dict(req)
        d["login_id"] = login_id
        items.append(d)
    return {"items": items, "limit": limit, "offset": offset}


@router.post("/cash/requests", summary="입출금 신청 생성 (관리자가 대신 생성)")
async def create_cash_request(
    body: CashCreateBody,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    try:
        amount = Decimal(body.amount)
    except Exception:
        raise HTTPException(status_code=400, detail="amount must be a valid number")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be positive")

    _admin_may_access_cash_request_user(db, user, body.user_id)

    target_u = db.get(User, body.user_id)
    if target_u is None:
        raise HTTPException(status_code=404, detail="user not found")
    site_row = db.get(SiteConfig, target_u.site_id)
    if site_row is None:
        raise HTTPException(status_code=500, detail="site config missing")

    rtype = body.request_type.upper()
    try:
        assert_cash_request_allowed(
            db,
            site=site_row,
            kind=rtype,
            amount=amount,
            user_id=body.user_id,
        )
    except SiteCashPolicyError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from e

    if rtype == "DEPOSIT":
        req = CashService.create_deposit_request(db, user_id=body.user_id, amount=amount, memo=body.memo)
    elif rtype == "WITHDRAW":
        try:
            req = CashService.create_withdraw_request(db, user_id=body.user_id, amount=amount, memo=body.memo)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    else:
        raise HTTPException(status_code=400, detail="request_type must be DEPOSIT or WITHDRAW")

    AuditService.log(
        db,
        actor=user,
        action="CASH_CREATE",
        target_type="CASH_REQUEST",
        target_id=str(req.id),
        after={"type": rtype, "amount": body.amount, "user_id": body.user_id},
        actor_ip=request.client.host if request and request.client else None,
    )
    db.commit()

    # WS 알림: 관리자들에게 새 입금 신청 즉시 통보
    await admin_ws_manager.broadcast_event(
        "cash_request_new",
        {
            "id": req.id,
            "request_type": rtype,
            "amount": body.amount,
            "user_id": body.user_id,
        },
    )
    await _broadcast_dashboard_refresh()
    return cash_request_to_dict(req)


@router.post("/cash/requests/{request_id}/processing", summary="처리중(대기) 표시 — 승인 전 검토용")
async def mark_cash_request_processing(
    request_id: int,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    req = db.scalars(
        select(CashRequest).where(CashRequest.id == request_id).with_for_update()
    ).one_or_none()
    if req is None:
        raise HTTPException(status_code=404, detail="신청을 찾을 수 없습니다.")
    _admin_may_access_cash_request_user(db, user, req.user_id)
    if req.status != "PENDING":
        raise HTTPException(
            status_code=400,
            detail="신규(PENDING) 상태의 신청만 처리중으로 바꿀 수 있습니다.",
        )
    req.status = "PROCESSING"
    AuditService.log(
        db,
        actor=user,
        action="CASH_MARK_PROCESSING",
        target_type="CASH_REQUEST",
        target_id=str(req.id),
        after={"status": "PROCESSING"},
        actor_ip=request.client.host if request and request.client else None,
    )
    db.commit()
    await admin_ws_manager.broadcast_event(
        "cash_request_updated",
        {"id": req.id, "status": "PROCESSING", "user_id": req.user_id},
    )
    await _broadcast_dashboard_refresh()
    return cash_request_to_dict(req)


@router.post("/cash/requests/{request_id}/approve", summary="입출금 승인")
async def approve_cash_request(
    request_id: int,
    body: CashActionBody,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    pre = db.scalars(select(CashRequest).where(CashRequest.id == request_id)).one_or_none()
    if pre is None:
        raise HTTPException(status_code=404, detail="신청을 찾을 수 없습니다.")
    _admin_may_access_cash_request_user(db, user, pre.user_id)
    try:
        req = CashService.approve(
            db,
            request_id=request_id,
            actor=user,
            actor_ip=request.client.host if request and request.client else None,
        )
        db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await admin_ws_manager.broadcast_event(
        "cash_request_approved",
        {"id": req.id, "request_type": req.request_type, "amount": str(req.amount)},
    )
    await _broadcast_dashboard_refresh()
    return cash_request_to_dict(req)


@router.post("/cash/requests/{request_id}/reject", summary="입출금 거절")
async def reject_cash_request(
    request_id: int,
    body: CashActionBody,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    request: Request = None,
) -> Dict[str, Any]:
    pre = db.scalars(select(CashRequest).where(CashRequest.id == request_id)).one_or_none()
    if pre is None:
        raise HTTPException(status_code=404, detail="신청을 찾을 수 없습니다.")
    _admin_may_access_cash_request_user(db, user, pre.user_id)
    try:
        req = CashService.reject(
            db,
            request_id=request_id,
            actor=user,
            reason=body.reason or "",
            actor_ip=request.client.host if request and request.client else None,
        )
        db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await admin_ws_manager.broadcast_event(
        "cash_request_updated",
        {"id": req.id, "status": "REJECTED", "user_id": req.user_id},
    )
    await _broadcast_dashboard_refresh()
    return cash_request_to_dict(req)


# ═══════════════════════════════════════════════════════════════════════════════
# E2: 정산 스냅샷 조회
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/settlements/snapshots", summary="정산 스냅샷 (불변 과거 데이터)")
def list_settlement_snapshots(
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
    batch_key: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    super_admin = user.role == USER_ROLE_SUPER_ADMIN
    stmt = select(SettlementSnapshot)
    if not super_admin:
        allowed = downward_subtree_user_ids(db, user.id)
        stmt = stmt.where(SettlementSnapshot.partner_user_id.in_(allowed))
    if batch_key:
        stmt = stmt.where(SettlementSnapshot.settlement_batch_key == batch_key)
    stmt = stmt.order_by(SettlementSnapshot.settled_at.desc()).offset(offset).limit(limit)
    rows = db.scalars(stmt).all()
    items = [
        {
            "id": r.id,
            "partner_user_id": r.partner_user_id,
            "source_user_id": r.source_user_id,
            "bet_id": r.bet_id,
            "game_type": r.game_type,
            "rate_percent_at_settlement": str(r.rate_percent_at_settlement),
            "valid_bet_amount": str(r.valid_bet_amount),
            "rolling_credited": str(r.rolling_credited),
            "settled_at": r.settled_at.isoformat() if r.settled_at else None,
            "settlement_batch_key": r.settlement_batch_key,
        }
        for r in rows
    ]
    return {"items": items, "limit": limit, "offset": offset}


# ═══════════════════════════════════════════════════════════════════════════════
# E4: Audit Log 조회
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/audit-logs", summary="관리자 활동 감사 로그 (슈퍼관리자 전용)")
def list_audit_logs(
    _admin=Depends(require_super_admin),
    db: Session = Depends(get_db),
    action: Optional[str] = None,
    actor_login_id: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    stmt = select(AuditLog).order_by(desc(AuditLog.created_at))
    if action:
        stmt = stmt.where(AuditLog.action == action.upper())
    if actor_login_id:
        stmt = stmt.where(AuditLog.actor_login_id.ilike(f"%{actor_login_id}%"))
    stmt = stmt.offset(offset).limit(limit)
    rows = db.scalars(stmt).all()
    items = [
        {
            "id": r.id,
            "actor_login_id": r.actor_login_id,
            "actor_role": r.actor_role,
            "actor_ip": r.actor_ip,
            "action": r.action,
            "target_type": r.target_type,
            "target_id": r.target_id,
            "before_json": r.before_json,
            "after_json": r.after_json,
            "note": r.note,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return {"items": items, "limit": limit, "offset": offset}


# ═══════════════════════════════════════════════════════════════════════════════
# E5: OTP (TOTP) 관리
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/otp/setup", summary="OTP 시크릿 발급 (미등록 or 재설정)")
def otp_setup(
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    _reject_if_partner_limited_ui(
        user,
        "하부 관리자 모드에서는 OTP 설정을 변경할 수 없습니다. 비밀번호만 변경 가능합니다.",
    )
    if user.otp_enabled:
        raise HTTPException(status_code=400, detail="OTP가 이미 활성화되어 있습니다. 먼저 비활성화하세요.")
    secret = generate_secret()
    user.otp_secret = secret
    db.commit()
    uri = get_provisioning_uri(secret, user.login_id)
    return {"provisioning_uri": uri, "secret": secret}


@router.post("/otp/verify-and-enable", summary="첫 OTP 코드 확인 후 활성화")
def otp_verify_enable(
    body: OtpVerifyBody,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    _reject_if_partner_limited_ui(
        user,
        "하부 관리자 모드에서는 OTP 설정을 변경할 수 없습니다. 비밀번호만 변경 가능합니다.",
    )
    if not user.otp_secret:
        raise HTTPException(status_code=400, detail="먼저 /otp/setup을 호출하세요.")
    if not verify_totp(user.otp_secret, body.code):
        raise HTTPException(status_code=400, detail="OTP 코드 불일치")
    user.otp_enabled = True
    db.commit()
    AuditService.log(db, actor=user, action="OTP_ENABLED", target_type="USER", target_id=str(user.id))
    db.commit()
    return {"otp_enabled": True, "login_id": user.login_id}


@router.post("/otp/disable", summary="OTP 비활성화 (슈퍼관리자 or 본인)")
def otp_disable(
    body: OtpVerifyBody,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    _reject_if_partner_limited_ui(
        user,
        "하부 관리자 모드에서는 OTP 설정을 변경할 수 없습니다. 비밀번호만 변경 가능합니다.",
    )
    if not user.otp_enabled:
        raise HTTPException(status_code=400, detail="OTP가 비활성화 상태입니다.")
    if not verify_totp(user.otp_secret, body.code):
        raise HTTPException(status_code=400, detail="OTP 코드 불일치")
    user.otp_enabled = False
    user.otp_secret = None
    db.commit()
    AuditService.log(db, actor=user, action="OTP_DISABLED", target_type="USER", target_id=str(user.id))
    db.commit()
    return {"otp_enabled": False}


# ═══════════════════════════════════════════════════════════════════════════════
# E1: Risk Engine 조회 / 수동 차단
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/risk/blocked-ips", summary="현재 차단 IP 목록 (슈퍼관리자)")
def risk_blocked_ips(_admin=Depends(require_super_admin)) -> Dict[str, Any]:
    return {"items": get_blocked_ips()}


@router.post("/risk/block-ip", summary="수동 IP 차단 (슈퍼관리자)")
def risk_block_ip(
    body: ManualBlockBody,
    _admin=Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    from app.services.risk_engine import manual_block_ip
    manual_block_ip(body.ip, duration_sec=body.duration_sec)
    AuditService.log(
        db, actor=_admin, action="IP_BLOCK",
        target_type="IP", target_id=body.ip,
        after={"duration_sec": body.duration_sec},
    )
    db.commit()
    return {"blocked": body.ip, "duration_sec": body.duration_sec}
