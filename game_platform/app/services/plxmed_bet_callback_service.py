"""
Plxmed 카지노 콜백(data[]) → gp_bet_history (wallet_neutral).

메인 게임머니는 Plxmed 지갑에서만 움직이므로 stake/당첨 입출금은 생략하고
배팅 로그·롤링 정산만 반영한다.
"""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.bet import BetHistory
from app.models.enums import GameResult
from app.models.user import User
from app.services.bet_placement_service import BetPlacementService
from app.services.settlement_service import SettlementService

logger = logging.getLogger(__name__)


def _game_type_from_item(item: Dict[str, Any]) -> str:
    prov = (item.get("provider_name") or "").lower()
    gd = item.get("game_details")
    cat = ""
    if isinstance(gd, dict):
        cat = str(gd.get("category") or "")
    cat = (cat or "").lower()
    if "slot" in prov or "slot" in cat:
        return "SLOT"
    return "LIVE_CASINO"


def _parse_amount(raw: Any) -> Decimal:
    if raw is None:
        return Decimal("0")
    try:
        return abs(Decimal(str(raw))).quantize(Decimal("0.000001"))
    except Exception:
        return Decimal("0")


def _round_external_uid(usercode: str, item: Dict[str, Any]) -> str:
    """BET·정산 행이 공유하는 라운드 키 (round_id 우선)."""
    rid = (item.get("round_id") or "").strip()
    if not rid:
        rid = str(item.get("seq_transaction_id") or item.get("transaction_id") or "")
    base = f"p{usercode}_{rid}"
    return base[:64]


def resolve_user_id_by_plxmed_username(db: Session, username: Optional[str]) -> Optional[int]:
    """Plxmed username → User.id. `sp_uid_{id}` 는 비ASCII login_id 회원용(plxmed_client)."""
    if not username:
        return None
    u = str(username).strip()
    if u.startswith("sp_uid_"):
        tail = u[7:].strip()
        if tail.isdigit():
            row = db.get(User, int(tail))
            return int(row.id) if row else None
        return None
    if not u.startswith("sp_"):
        return None
    login_id = u[3:].strip()
    if not login_id:
        return None
    row = db.scalars(select(User).where(User.login_id == login_id)).one_or_none()
    return int(row.id) if row else None


def process_plxmed_data_rows(
    db: Session,
    *,
    usercode: str,
    data_rows: Optional[List[Dict[str, Any]]],
    username_hint: Optional[str] = None,
) -> Dict[str, Any]:
    if not data_rows:
        return {"ok": True, "processed": 0, "detail": "no data rows"}

    login_source = username_hint
    for row in data_rows:
        if row.get("username"):
            login_source = row.get("username")
            break

    user_id = resolve_user_id_by_plxmed_username(db, login_source)
    if user_id is None:
        logger.warning("[plxmed-callback] user not found for username=%r", login_source)
        return {"ok": False, "processed": 0, "detail": "user not found for sp_ login_id"}

    def sort_key(r: Dict[str, Any]) -> tuple:
        tt = (r.get("transaction_type") or "").upper()
        prio = 0 if tt == "BET" else 1
        return (prio, str(r.get("created_date") or ""), str(r.get("transaction_id") or ""))

    ordered = sorted(data_rows, key=sort_key)

    processed = 0
    errors: List[str] = []

    for item in ordered:
        tt = (item.get("transaction_type") or "").upper()
        tp = (item.get("transaction_purpose") or "").upper()
        amt = _parse_amount(item.get("transaction_amount"))
        ext = _round_external_uid(usercode, item)
        gtype = _game_type_from_item(item)

        try:
            if tt == "BET" or (tp == "DEBIT" and "BET" in (tt, tp)):
                if amt <= 0:
                    continue
                existing = db.scalars(
                    select(BetHistory).where(BetHistory.external_bet_uid == ext)
                ).one_or_none()
                if existing:
                    processed += 1
                    continue
                res = BetPlacementService.place_pending_bet(
                    db,
                    user_id=user_id,
                    external_bet_uid=ext,
                    game_type=gtype,
                    stake=amt,
                    wallet_neutral=True,
                )
                if res.ok:
                    processed += 1
                else:
                    errors.append(f"place {ext}: {res.detail}")
                continue

            if tt in ("WIN", "LOSE", "TIE", "CANCEL", "VOID", "PUSH"):
                gr: GameResult
                win_amt: Decimal
                if tt == "WIN":
                    gr = GameResult.WIN
                    win_amt = amt
                elif tt == "LOSE":
                    gr = GameResult.LOSE
                    win_amt = Decimal("0")
                elif tt == "TIE":
                    gr = GameResult.TIE
                    win_amt = amt
                elif tt in ("CANCEL", "VOID"):
                    gr = GameResult.VOID
                    win_amt = amt
                elif tt == "PUSH":
                    gr = GameResult.PUSH
                    win_amt = amt

                st = SettlementService.settle_from_game_api(
                    db,
                    external_bet_uid=ext,
                    game_result=gr,
                    win_amount=win_amt,
                    wallet_neutral=True,
                )
                if st.ok:
                    processed += 1
                elif st.detail == "bet not found":
                    errors.append(f"settle missing bet {ext}")
                else:
                    errors.append(f"settle {ext}: {st.detail}")
        except Exception as exc:
            logger.exception("[plxmed-callback] row error: %s", item)
            errors.append(str(exc))

    return {
        "ok": not errors,
        "processed": processed,
        "errors": errors[:20],
        "user_id": user_id,
    }
