"""팀 네트워크(다단계) — 계정 생성·요율·머니 이동.

모든 행은 동일 `gp_users`(회원). 상하 관계는 `referrer_id`(추천인 체인 A→B→C…).
네트워크 정산·롤링 참여는 `user_is_partner` / 요율 임계값으로만 판별(역할 무관).
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_password
from app.dependencies.auth_jwt import require_admin_user
from app.models.audit_log import AuditLog
from app.models.ledger import GameMoneyLedgerEntry
from app.models.user import User, UserGameRollingRate
from app.services.audit_service import AuditService
from app.services.downline_subtree import downward_subtree_user_ids
from app.services.partner_utils import user_is_partner

router = APIRouter()

# ─── 상수 ─────────────────────────────────────────────────────────────────────
GAME_TYPES = ["CASINO", "SLOT", "SPORTS", "POWERBALL"]


# ─── Pydantic ─────────────────────────────────────────────────────────────────

class PartnerCreateBody(BaseModel):
    login_id: str = Field(..., min_length=3, max_length=32)
    password: str = Field(..., min_length=4)
    display_name: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    account_holder: Optional[str] = None
    phone: Optional[str] = None
    # 하부 역할: 배팅 회원(player) 또는 총판·어드민(owner). 파트너 여부는 요율로 별도 판별.
    role: str = Field(default="player", description="player | owner")
    # 요율 초기값
    casino_rolling: float = 0.0
    slot_rolling: float = 0.0
    casino_settle: float = 0.0
    slot_settle: float = 0.0
    # 상위 user id: 기본은 로그인 유저. 특정 하부 밑에 만들 때는 그 노드의 id (= 그 계정이 추천인)
    referrer_id_override: Optional[int] = None
    # 트리에 표시할 직책(임의 문자열, 권한과 무관)
    team_role_label: Optional[str] = Field(None, max_length=64)

    @field_validator("role")
    @classmethod
    def _role_ok(cls, v: str) -> str:
        r = (v or "player").strip().lower()
        if r not in ("player", "owner"):
            raise ValueError("role 은 player 또는 owner 만 허용됩니다.")
        return r


class PartnerRateBody(BaseModel):
    casino_rolling: float = Field(0.0, ge=0, le=100)
    slot_rolling: float = Field(0.0, ge=0, le=100)
    casino_settle: float = Field(0.0, ge=0, le=100)
    slot_settle: float = Field(0.0, ge=0, le=100)


class MoneyTransferBody(BaseModel):
    amount: str
    memo: Optional[str] = None


class PasswordChangeBody(BaseModel):
    new_password: str = Field(..., min_length=4)


class PartnerTeamRolePatchBody(BaseModel):
    """트리·목록 표시용 직책(마스터, 본사, 서울 스태프 등). 비우면 삭제."""

    team_role_label: Optional[str] = Field(None, max_length=64)


# ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

def _get_rates(db: Session, user_id: int) -> Dict[str, float]:
    rows = db.scalars(
        select(UserGameRollingRate).where(UserGameRollingRate.user_id == user_id)
    ).all()
    rate_map: Dict[str, float] = {r.game_type: float(r.rolling_rate_percent) for r in rows}
    return rate_map


def _set_rates(db: Session, user_id: int, casino_rolling: float, slot_rolling: float,
               casino_settle: float, slot_settle: float) -> None:
    mapping = {
        "CASINO": casino_rolling,
        "SLOT": slot_rolling,
        "CASINO_SETTLE": casino_settle,
        "SLOT_SETTLE": slot_settle,
    }
    for game_type, val in mapping.items():
        existing = db.scalar(
            select(UserGameRollingRate).where(
                UserGameRollingRate.user_id == user_id,
                UserGameRollingRate.game_type == game_type,
            )
        )
        if existing:
            existing.rolling_rate_percent = Decimal(str(val))
        else:
            db.add(UserGameRollingRate(
                user_id=user_id,
                game_type=game_type,
                rolling_rate_percent=Decimal(str(val)),
                losing_rate_percent=Decimal("0"),
            ))


def _clip_team_role_label(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    return s[:64]


def _partner_dict(db: Session, u: User, viewer_id: int) -> Dict[str, Any]:
    """하부 행 직렬화 (referrer_id = 추천인 user id)."""
    rates = _get_rates(db, u.id)
    child_count = db.scalar(
        select(func.count()).select_from(User).where(User.referrer_id == u.id)
    ) or 0
    return {
        "id": u.id,
        "login_id": u.login_id,
        "display_name": u.display_name,
        "team_role_label": u.team_role_label,
        "is_active": u.is_active,
        "is_partner": user_is_partner(db, u.id),
        "game_money_balance": str(u.game_money_balance),
        "rolling_point_balance": str(u.rolling_point_balance),
        "casino_rolling": rates.get("CASINO", 0.0),
        "slot_rolling": rates.get("SLOT", 0.0),
        "casino_settle": rates.get("CASINO_SETTLE", 0.0),
        "slot_settle": rates.get("SLOT_SETTLE", 0.0),
        "child_count": child_count,
        "referrer_id": u.referrer_id,
    }


def _assert_is_my_downline(db: Session, viewer: User, target_id: int) -> User:
    """target_id가 viewer의 하향 트리 안에 있는지 확인."""
    target = db.get(User, target_id)
    if target is None:
        raise HTTPException(status_code=404, detail="대상 회원을 찾을 수 없습니다.")
    if viewer.role != "super_admin":
        subtree = downward_subtree_user_ids(db, viewer.id)
        if target_id not in subtree:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="본인 하향 트리(추천인 네트워크) 안의 회원만 관리할 수 있습니다.",
            )
    return target


# ─── 엔드포인트 ───────────────────────────────────────────────────────────────

@router.get("/partners", summary="직속 팀원 목록 (추천인 1단)")
def list_partners(
    parent_id: Optional[int] = Query(None, description="None이면 본인 id가 추천인인 직속 회원만"),
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    parent_id가 None이면 로그인 유저를 추천인으로 둔 직속 1단 회원을 반환.
    parent_id를 지정하면 해당 회원을 추천인으로 둔 직속 1단을 반환 (본인 하향 트리 안만).
    """
    if parent_id is None:
        root_id = user.id
    else:
        _assert_is_my_downline(db, user, parent_id)
        root_id = parent_id

    rows = db.scalars(
        select(User).where(User.referrer_id == root_id).order_by(User.id)
    ).all()
    return {
        "parent_id": root_id,
        "items": [_partner_dict(db, r, user.id) for r in rows],
    }


@router.post("/partners", summary="팀원(회원) 계정 생성", status_code=201)
def create_partner(
    body: PartnerCreateBody,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """신규 유저 `referrer_id` = 상위 id (기본: 로그인 유저, override 시 트리 내 노드)."""
    # 중복 ID 체크
    exists = db.scalar(select(User).where(User.login_id == body.login_id))
    if exists:
        raise HTTPException(status_code=400, detail="이미 존재하는 아이디입니다.")

    # 부모 결정: override 지정 시 트리 검증
    parent_id = user.id
    if body.referrer_id_override and body.referrer_id_override != user.id:
        _assert_is_my_downline(db, user, body.referrer_id_override)
        parent_id = body.referrer_id_override

    new_user = User(
        login_id=body.login_id,
        hashed_password=hash_password(body.password),
        display_name=body.display_name or body.login_id,
        site_id=user.site_id,
        referrer_id=parent_id,
        role=body.role,
        is_active=True,
        game_money_balance=Decimal("0"),
        rolling_point_balance=Decimal("0"),
        team_role_label=_clip_team_role_label(body.team_role_label),
    )
    db.add(new_user)
    db.flush()  # ID 확보

    # 요율 설정
    _set_rates(db, new_user.id,
               body.casino_rolling, body.slot_rolling,
               body.casino_settle, body.slot_settle)

    AuditService.log(
        db, actor=user,
        action="PARTNER_CREATE",
        target_type="USER", target_id=str(new_user.id),
        note=f"login_id={body.login_id}, parent={user.login_id}",
    )
    db.commit()
    db.refresh(new_user)
    return _partner_dict(db, new_user, user.id)


@router.get("/partners/{partner_id}", summary="팀원(회원) 상세 조회")
def get_partner(
    partner_id: int,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    target = _assert_is_my_downline(db, user, partner_id)
    return _partner_dict(db, target, user.id)


@router.patch("/partners/{partner_id}/rates", summary="회원 요율 설정 (네트워크 정산)")
def set_partner_rates(
    partner_id: int,
    body: PartnerRateBody,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    target = _assert_is_my_downline(db, user, partner_id)
    _set_rates(db, target.id,
               body.casino_rolling, body.slot_rolling,
               body.casino_settle, body.slot_settle)
    AuditService.log(
        db, actor=user,
        action="RATE_UPDATE",
        target_type="USER", target_id=str(target.id),
        note=f"casino_r={body.casino_rolling}% slot_r={body.slot_rolling}%",
    )
    db.commit()
    return _partner_dict(db, target, user.id)


@router.post("/partners/{partner_id}/pay", summary="머니 지급 (상위→하위)")
def pay_partner(
    partner_id: int,
    body: MoneyTransferBody,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    target = _assert_is_my_downline(db, user, partner_id)
    amount = Decimal(body.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="0보다 큰 금액을 입력하세요.")
    if user.game_money_balance < amount:
        raise HTTPException(status_code=400, detail="보유 머니가 부족합니다.")

    user.game_money_balance -= amount
    target.game_money_balance += amount

    db.add(GameMoneyLedgerEntry(
        user_id=user.id, delta=-amount,
        reason="PARTNER_PAY",
        reference_type="USER", reference_id=str(target.id),
        balance_after=user.game_money_balance,
    ))
    db.add(GameMoneyLedgerEntry(
        user_id=target.id, delta=amount,
        reason="PARTNER_RECEIVE",
        reference_type="USER", reference_id=str(user.id),
        balance_after=target.game_money_balance,
    ))
    AuditService.log(
        db, actor=user, action="PARTNER_PAY",
        target_type="USER", target_id=str(target.id),
        note=f"amount={amount}",
    )
    db.commit()
    return {"ok": True, "paid": str(amount), "your_balance": str(user.game_money_balance)}


@router.post("/partners/{partner_id}/collect", summary="머니 회수 (하위←상위)")
def collect_partner(
    partner_id: int,
    body: MoneyTransferBody,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    target = _assert_is_my_downline(db, user, partner_id)
    amount = Decimal(body.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="0보다 큰 금액을 입력하세요.")
    if target.game_money_balance < amount:
        raise HTTPException(
            status_code=400,
            detail=f"회수 가능 금액({target.game_money_balance})보다 많습니다.",
        )

    target.game_money_balance -= amount
    user.game_money_balance += amount

    db.add(GameMoneyLedgerEntry(
        user_id=target.id, delta=-amount,
        reason="PARTNER_COLLECT_OUT",
        reference_type="USER", reference_id=str(user.id),
        balance_after=target.game_money_balance,
    ))
    db.add(GameMoneyLedgerEntry(
        user_id=user.id, delta=amount,
        reason="PARTNER_COLLECT_IN",
        reference_type="USER", reference_id=str(target.id),
        balance_after=user.game_money_balance,
    ))
    AuditService.log(
        db, actor=user, action="PARTNER_COLLECT",
        target_type="USER", target_id=str(target.id),
        note=f"amount={amount}",
    )
    db.commit()
    return {"ok": True, "collected": str(amount), "your_balance": str(user.game_money_balance)}


@router.patch("/partners/{partner_id}/team-role", summary="트리 표시용 직책(임의 라벨) 설정")
def patch_partner_team_role(
    partner_id: int,
    body: PartnerTeamRolePatchBody,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    target = _assert_is_my_downline(db, user, partner_id)
    target.team_role_label = _clip_team_role_label(body.team_role_label)
    AuditService.log(
        db,
        actor=user,
        action="PARTNER_TEAM_ROLE",
        target_type="USER",
        target_id=str(target.id),
        note=f"team_role_label={target.team_role_label!r}",
    )
    db.commit()
    db.refresh(target)
    return _partner_dict(db, target, user.id)


@router.patch("/partners/{partner_id}/toggle", summary="회원 활성/비활성 토글")
def toggle_partner(
    partner_id: int,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    target = _assert_is_my_downline(db, user, partner_id)
    target.is_active = not target.is_active
    AuditService.log(
        db, actor=user, action="PARTNER_TOGGLE",
        target_type="USER", target_id=str(target.id),
        note=f"is_active={target.is_active}",
    )
    db.commit()
    return {"ok": True, "is_active": target.is_active}


@router.patch("/partners/{partner_id}/password", summary="회원 비밀번호 변경")
def change_partner_password(
    partner_id: int,
    body: PasswordChangeBody,
    user=Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    target = _assert_is_my_downline(db, user, partner_id)
    target.hashed_password = hash_password(body.new_password)
    AuditService.log(
        db, actor=user, action="PARTNER_PW_CHANGE",
        target_type="USER", target_id=str(target.id),
    )
    db.commit()
    return {"ok": True}
