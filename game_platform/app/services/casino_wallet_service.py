"""메인 게임머니 ↔ Plxmed 카지노 지갑 전환."""
from __future__ import annotations

import logging
import secrets
from decimal import Decimal
from typing import Any, Dict

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import GameMoneyLedgerReason
from app.models.ledger import GameMoneyLedgerEntry
from app.models.site_config import SiteConfig
from app.models.user import User
from app.services import plxmed_client as plx

logger = logging.getLogger(__name__)


def _ledger_only_transfers() -> bool:
    """True면 Plxmed 없이 원장만 — 게임 속 잔고와 맞지 않음(배팅 불가). 데모 UI(NEXT_PUBLIC_DEMO)와 별개."""
    from app.core.config import settings as s

    return bool(s.PLXMED_LEDGER_ONLY_TRANSFERS or s.PLXMED_TRANSFER_DEMO_MODE)


def is_casino_transfer_ledger_only() -> bool:
    """라우터·문서용 공개 래퍼."""
    return _ledger_only_transfers()


def _require_casino_site(db: Session, user: User) -> None:
    site = db.get(SiteConfig, user.site_id)
    if site is None or not site.is_casino_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="카지노·슬롯이 비활성화된 사이트입니다.",
        )


def _parse_amount(raw: str) -> Decimal:
    try:
        d = Decimal(str(raw).strip())
    except Exception as e:
        raise HTTPException(status_code=400, detail="금액 형식이 올바르지 않습니다.") from e
    if d <= 0:
        raise HTTPException(status_code=400, detail="금액은 0보다 커야 합니다.")
    return d.quantize(Decimal("0.000001"))


def _decimal_str_for_plxmed(amt: Decimal) -> str:
    """Plxmed transaction_amount — 불필요한 소수·지수 표기 제거(일부 API가 '10000.000000' 거부)."""
    q = amt.quantize(Decimal("0.000001"))
    if q == q.to_integral():
        return str(int(q))
    s = format(q, "f").rstrip("0").rstrip(".")
    return s if s else "0"


def _ext_tx_id() -> str:
    """Plxmed 요구: ext_transaction_id 는 16자리 숫자(^\\d{16}$). hex( token_hex ) 는 1004 거부됨."""
    return f"{secrets.randbelow(10**16):016d}"


def _ledger_casino_balance(db: Session, user_id: int) -> Decimal:
    """데모 모드: 카지노 지갑 잔액 = 원장상 입금(게임머니→카지노) − 환급 − 출금(카지노→게임머니)."""
    dep = GameMoneyLedgerReason.CASINO_WALLET_DEPOSIT.value
    ref = GameMoneyLedgerReason.CASINO_WALLET_DEPOSIT_REFUND.value
    wdr = GameMoneyLedgerReason.CASINO_WALLET_WITHDRAW.value
    rows = db.scalars(
        select(GameMoneyLedgerEntry).where(
            GameMoneyLedgerEntry.user_id == user_id,
            GameMoneyLedgerEntry.reason.in_((dep, ref, wdr)),
        )
    ).all()
    net = Decimal("0")
    for e in rows:
        if e.reason == dep:
            net += -e.delta
        elif e.reason == ref:
            net -= e.delta
        elif e.reason == wdr:
            net -= e.delta
    return net.quantize(Decimal("0.000001"))


def get_casino_wallet_status(db: Session, user: User) -> Dict[str, Any]:
    """Plxmed 카지노 잔액 + 로컬 게임머니."""
    _settings_check()
    _require_casino_site(db, user)

    if _ledger_only_transfers():
        db.refresh(user)
        cb = _ledger_casino_balance(db, user.id)
        if cb < 0:
            cb = Decimal("0")
        return {
            "game_money_balance": str(user.game_money_balance),
            "casino_balance": str(cb),
            "plxmed_transfer_demo": True,
            "ledger_only_transfers": True,
        }

    try:
        uc, tok = plx.plxmed_createaccount_usercode_token(
            user.login_id, getattr(user, "email", None), user_id=user.id
        )
        bal_raw = plx.plxmed_get_balance(uc, tok)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"카지노 잔액 조회 실패: {e}") from e

    casino_balance = ""
    if plx.plxmed_success(bal_raw):
        inner = bal_raw.get("data") or {}
        casino_balance = str(inner.get("available_balance") or inner.get("balance") or "0")
    else:
        casino_balance = "0"

    db.refresh(user)
    return {
        "game_money_balance": str(user.game_money_balance),
        "casino_balance": casino_balance,
    }


# 순환 import 방지용 지연 로드
def _settings_check():
    from app.core.config import settings as s

    if _ledger_only_transfers():
        return
    if not (s.PLXMED_SECURITY_KEY or "").strip():
        raise HTTPException(
            status_code=503,
            detail="Plxmed 연동 키(PLXMED_SECURITY_KEY)가 설정되지 않았습니다.",
        )


def transfer_main_to_casino(db: Session, user: User, amount_raw: str) -> Dict[str, Any]:
    """게임머니 차감 → Plxmed addmemberpoint (에이전트 풀에서 회원 카지노 지갑으로)."""
    _settings_check()
    _require_casino_site(db, user)
    amt = _parse_amount(amount_raw)

    locked = db.scalars(select(User).where(User.id == user.id).with_for_update()).one()
    if locked.game_money_balance < amt:
        raise HTTPException(status_code=400, detail="게임머니가 부족합니다.")

    ext_id = _ext_tx_id()
    old_bal = locked.game_money_balance
    new_bal = (old_bal - amt).quantize(Decimal("0.000001"))
    locked.game_money_balance = new_bal
    db.add(
        GameMoneyLedgerEntry(
            user_id=locked.id,
            delta=-amt,
            balance_after=new_bal,
            reason=GameMoneyLedgerReason.CASINO_WALLET_DEPOSIT.value,
            reference_type="CASINO_PLXMED",
            reference_id=ext_id,
        )
    )
    db.commit()

    if _ledger_only_transfers():
        db.refresh(user)
        return {
            "ok": True,
            "transferred": str(amt),
            "game_money_balance": str(user.game_money_balance),
            "ext_transaction_id": ext_id,
            "plxmed_transfer_demo": True,
            "ledger_only_transfers": True,
        }

    try:
        uc, tok = plx.plxmed_createaccount_usercode_token(
            locked.login_id, getattr(locked, "email", None), user_id=locked.id
        )
        resp = plx.plxmed_add_member_point(uc, _decimal_str_for_plxmed(amt), ext_id)
        if not plx.plxmed_success(resp):
            logger.warning("plxmed addmemberpoint not success: %s", resp)
            raise RuntimeError(resp.get("message", resp.get("code", "Plxmed addmemberpoint failed")))
    except Exception as e:
        u2 = db.scalars(select(User).where(User.id == user.id).with_for_update()).one()
        rollback_bal = (u2.game_money_balance + amt).quantize(Decimal("0.000001"))
        u2.game_money_balance = rollback_bal
        db.add(
            GameMoneyLedgerEntry(
                user_id=u2.id,
                delta=amt,
                balance_after=rollback_bal,
                reason=GameMoneyLedgerReason.CASINO_WALLET_DEPOSIT_REFUND.value,
                reference_type="CASINO_PLXMED",
                reference_id=ext_id,
            )
        )
        db.commit()
        raise HTTPException(
            status_code=502,
            detail=f"카지노 지갑 충전에 실패했습니다. 게임머니는 환급되었습니다. ({e})",
        ) from e

    db.refresh(user)
    return {
        "ok": True,
        "transferred": str(amt),
        "game_money_balance": str(user.game_money_balance),
        "ext_transaction_id": ext_id,
    }


def transfer_casino_to_main(db: Session, user: User, amount_raw: str) -> Dict[str, Any]:
    """Plxmed subtractmemberpoint → 게임머니 증가."""
    _settings_check()
    _require_casino_site(db, user)
    amt = _parse_amount(amount_raw)
    ext_id = _ext_tx_id()

    if _ledger_only_transfers():
        avail = _ledger_casino_balance(db, user.id)
        if avail < 0:
            avail = Decimal("0")
        if avail < amt:
            raise HTTPException(
                status_code=400,
                detail="카지노(데모) 잔액이 부족합니다.",
            )
        locked = db.scalars(select(User).where(User.id == user.id).with_for_update()).one()
        new_bal = (locked.game_money_balance + amt).quantize(Decimal("0.000001"))
        locked.game_money_balance = new_bal
        db.add(
            GameMoneyLedgerEntry(
                user_id=locked.id,
                delta=amt,
                balance_after=new_bal,
                reason=GameMoneyLedgerReason.CASINO_WALLET_WITHDRAW.value,
                reference_type="CASINO_PLXMED_DEMO",
                reference_id=ext_id,
            )
        )
        db.commit()
        db.refresh(user)
        return {
            "ok": True,
            "transferred": str(amt),
            "game_money_balance": str(user.game_money_balance),
            "ext_transaction_id": ext_id,
            "plxmed_transfer_demo": True,
            "ledger_only_transfers": True,
        }

    try:
        uc, tok = plx.plxmed_createaccount_usercode_token(
            user.login_id, getattr(user, "email", None), user_id=user.id
        )
        resp = plx.plxmed_subtract_member_point(uc, _decimal_str_for_plxmed(amt), ext_id)
        if not plx.plxmed_success(resp):
            raise RuntimeError(resp.get("message", resp.get("code", "subtractmemberpoint failed")))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"카지노 지갑에서 출금하지 못했습니다. 카지노 잔액을 확인해 주세요. ({e})",
        ) from e

    locked = db.scalars(select(User).where(User.id == user.id).with_for_update()).one()
    new_bal = (locked.game_money_balance + amt).quantize(Decimal("0.000001"))
    locked.game_money_balance = new_bal
    db.add(
        GameMoneyLedgerEntry(
            user_id=locked.id,
            delta=amt,
            balance_after=new_bal,
            reason=GameMoneyLedgerReason.CASINO_WALLET_WITHDRAW.value,
            reference_type="CASINO_PLXMED",
            reference_id=ext_id,
        )
    )
    db.commit()
    db.refresh(user)
    return {
        "ok": True,
        "transferred": str(amt),
        "game_money_balance": str(user.game_money_balance),
        "ext_transaction_id": ext_id,
    }
