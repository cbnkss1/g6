"""통합 배팅내역 — 스테이크/당첨 줄 단위 (이전잔고·거래·이후잔고)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.models.bet import BetHistory
from app.models.enums import BetStatus
from app.models.ledger import GameMoneyLedgerEntry
from app.models.sports import SportsTx
from app.models.user import User


def _ledger_key(t: Optional[str], r: Optional[str]) -> Tuple[str, str]:
    return (t or "", r or "")


def _fetch_ledger_index(db: Session, bets: List[BetHistory]) -> Dict[Tuple[str, str], GameMoneyLedgerEntry]:
    if not bets:
        return {}
    clauses = []
    for b in bets:
        ext = b.external_bet_uid
        clauses.append(
            and_(
                GameMoneyLedgerEntry.reference_type == "BET_STAKE",
                GameMoneyLedgerEntry.reference_id == ext,
            )
        )
        clauses.append(
            and_(
                GameMoneyLedgerEntry.reference_type == "BET",
                GameMoneyLedgerEntry.reference_id == str(b.id),
            )
        )
        if ext.startswith("gp_pb_"):
            pid = ext[6:]
            clauses.append(
                and_(
                    GameMoneyLedgerEntry.reference_type == "POWERBALL_STAKE",
                    GameMoneyLedgerEntry.reference_id == pid,
                )
            )
            clauses.append(
                and_(
                    GameMoneyLedgerEntry.reference_type == "POWERBALL_WIN",
                    GameMoneyLedgerEntry.reference_id == pid,
                )
            )
    rows = list(db.scalars(select(GameMoneyLedgerEntry).where(or_(*clauses))).all())
    idx: Dict[Tuple[str, str], GameMoneyLedgerEntry] = {}
    for row in rows:
        k = _ledger_key(row.reference_type, row.reference_id)
        prev = idx.get(k)
        if prev is None or (row.id > prev.id):
            idx[k] = row
    return idx


def _sports_tx_by_bet_id(db: Session, bets: List[BetHistory]) -> Dict[int, List[SportsTx]]:
    ids: List[int] = []
    for b in bets:
        if not b.external_bet_uid.startswith("gp_sp_"):
            continue
        try:
            ids.append(int(b.external_bet_uid[6:]))
        except ValueError:
            continue
    if not ids:
        return {}
    rows = list(
        db.scalars(select(SportsTx).where(SportsTx.bet_id.in_(ids)).order_by(SportsTx.id)).all()
    )
    m: Dict[int, List[SportsTx]] = {}
    for t in rows:
        if t.bet_id is None:
            continue
        m.setdefault(t.bet_id, []).append(t)
    return m


def _stake_entry(bet: BetHistory, idx: Dict[Tuple[str, str], GameMoneyLedgerEntry]) -> Optional[GameMoneyLedgerEntry]:
    ext = bet.external_bet_uid
    if ext.startswith("gp_pb_"):
        pid = ext[6:]
        e = idx.get(_ledger_key("POWERBALL_STAKE", pid))
        if e is not None:
            return e
    return idx.get(_ledger_key("BET_STAKE", ext))


def _win_entry(bet: BetHistory, idx: Dict[Tuple[str, str], GameMoneyLedgerEntry]) -> Optional[GameMoneyLedgerEntry]:
    ext = bet.external_bet_uid
    if ext.startswith("gp_pb_"):
        pid = ext[6:]
        e = idx.get(_ledger_key("POWERBALL_WIN", pid))
        if e is not None and e.delta > 0:
            return e
    e2 = idx.get(_ledger_key("BET", str(bet.id)))
    if e2 is not None and e2.delta > 0:
        return e2
    return None


def lines_for_bets(db: Session, bets: List[BetHistory], login_by_uid: Dict[int, str]) -> List[Dict[str, Any]]:
    idx = _fetch_ledger_index(db, bets)
    sports_map = _sports_tx_by_bet_id(db, bets)
    out: List[Dict[str, Any]] = []
    for bet in bets:
        lid = login_by_uid.get(bet.user_id, "")
        stake_sports: Optional[SportsTx] = None
        win_sports: Optional[SportsTx] = None
        void_sports: Optional[SportsTx] = None
        if bet.external_bet_uid.startswith("gp_sp_"):
            try:
                sid = int(bet.external_bet_uid[6:])
                txs = sports_map.get(sid, [])
                stake_sports = next((x for x in txs if x.tx_type == "BET_STAKE"), None)
                win_sports = next((x for x in txs if x.tx_type == "WIN_PAYOUT" and x.amount > 0), None)
                void_sports = next((x for x in txs if x.tx_type == "VOID_REFUND" and x.amount > 0), None)
            except ValueError:
                pass

        stake = _stake_entry(bet, idx)
        if stake_sports is not None:
            prev = (stake_sports.balance_after - stake_sports.amount).quantize(Decimal("0.000001"))
            amt = abs(stake_sports.amount)
            out.append(
                {
                    "bet_history_id": bet.id,
                    "external_bet_uid": bet.external_bet_uid,
                    "login_id": lid,
                    "user_id": bet.user_id,
                    "game_type": bet.game_type,
                    "occurred_at": stake_sports.created_at.isoformat()
                    if stake_sports.created_at
                    else None,
                    "prev_balance": str(prev),
                    "tx_amount": str(amt),
                    "after_balance": str(stake_sports.balance_after),
                    "line_kind": "bet",
                    "line_label_ko": "베팅",
                }
            )
        elif stake is not None:
            prev = (stake.balance_after - stake.delta).quantize(Decimal("0.000001"))
            amt = abs(stake.delta)
            out.append(
                {
                    "bet_history_id": bet.id,
                    "external_bet_uid": bet.external_bet_uid,
                    "login_id": lid,
                    "user_id": bet.user_id,
                    "game_type": bet.game_type,
                    "occurred_at": stake.created_at.isoformat() if stake.created_at else None,
                    "prev_balance": str(prev),
                    "tx_amount": str(amt),
                    "after_balance": str(stake.balance_after),
                    "line_kind": "bet",
                    "line_label_ko": "베팅",
                }
            )
        else:
            out.append(
                {
                    "bet_history_id": bet.id,
                    "external_bet_uid": bet.external_bet_uid,
                    "login_id": lid,
                    "user_id": bet.user_id,
                    "game_type": bet.game_type,
                    "occurred_at": bet.created_at.isoformat() if bet.created_at else None,
                    "prev_balance": "",
                    "tx_amount": str(bet.bet_amount),
                    "after_balance": "",
                    "line_kind": "bet",
                    "line_label_ko": "베팅",
                }
            )

        if bet.status == BetStatus.SETTLED.value:
            if bet.game_result == "WIN":
                if win_sports is not None:
                    prev_w = (win_sports.balance_after - win_sports.amount).quantize(Decimal("0.000001"))
                    out.append(
                        {
                            "bet_history_id": bet.id,
                            "external_bet_uid": bet.external_bet_uid,
                            "login_id": lid,
                            "user_id": bet.user_id,
                            "game_type": bet.game_type,
                            "occurred_at": win_sports.created_at.isoformat()
                            if win_sports.created_at
                            else None,
                            "prev_balance": str(prev_w),
                            "tx_amount": str(win_sports.amount),
                            "after_balance": str(win_sports.balance_after),
                            "line_kind": "win",
                            "line_label_ko": "당첨",
                        }
                    )
                else:
                    win = _win_entry(bet, idx)
                    if win is not None:
                        prev_w = (win.balance_after - win.delta).quantize(Decimal("0.000001"))
                        out.append(
                            {
                                "bet_history_id": bet.id,
                                "external_bet_uid": bet.external_bet_uid,
                                "login_id": lid,
                                "user_id": bet.user_id,
                                "game_type": bet.game_type,
                                "occurred_at": win.created_at.isoformat() if win.created_at else None,
                                "prev_balance": str(prev_w),
                                "tx_amount": str(win.delta),
                                "after_balance": str(win.balance_after),
                                "line_kind": "win",
                                "line_label_ko": "당첨",
                            }
                        )
                    elif bet.win_amount and Decimal(str(bet.win_amount)) > 0:
                        out.append(
                            {
                                "bet_history_id": bet.id,
                                "external_bet_uid": bet.external_bet_uid,
                                "login_id": lid,
                                "user_id": bet.user_id,
                                "game_type": bet.game_type,
                                "occurred_at": bet.settled_at.isoformat() if bet.settled_at else None,
                                "prev_balance": "",
                                "tx_amount": str(bet.win_amount),
                                "after_balance": "",
                                "line_kind": "win",
                                "line_label_ko": "당첨",
                            }
                        )
            elif bet.game_result == "LOSE":
                base_after = (
                    stake_sports.balance_after
                    if stake_sports is not None
                    else (stake.balance_after if stake is not None else None)
                )
                out.append(
                    {
                        "bet_history_id": bet.id,
                        "external_bet_uid": bet.external_bet_uid,
                        "login_id": lid,
                        "user_id": bet.user_id,
                        "game_type": bet.game_type,
                        "occurred_at": bet.settled_at.isoformat() if bet.settled_at else None,
                        "prev_balance": str(base_after) if base_after is not None else "",
                        "tx_amount": str(bet.bet_amount),
                        "after_balance": str(base_after) if base_after is not None else "",
                        "line_kind": "lose",
                        "line_label_ko": "낙첨",
                    }
                )
            elif bet.game_result == "VOID" and void_sports is not None:
                prev_v = (void_sports.balance_after - void_sports.amount).quantize(Decimal("0.000001"))
                out.append(
                    {
                        "bet_history_id": bet.id,
                        "external_bet_uid": bet.external_bet_uid,
                        "login_id": lid,
                        "user_id": bet.user_id,
                        "game_type": bet.game_type,
                        "occurred_at": void_sports.created_at.isoformat()
                        if void_sports.created_at
                        else None,
                        "prev_balance": str(prev_v),
                        "tx_amount": str(void_sports.amount),
                        "after_balance": str(void_sports.balance_after),
                        "line_kind": "win",
                        "line_label_ko": "적특환불",
                    }
                )

    out.sort(
        key=lambda r: (r.get("occurred_at") or "", r["bet_history_id"], r["line_kind"]),
        reverse=True,
    )
    return out


def build_history_lines_for_scope(
    db: Session,
    *,
    bets: List[BetHistory],
) -> List[Dict[str, Any]]:
    uids = {b.user_id for b in bets}
    login_by_uid: Dict[int, str] = {}
    if uids:
        for u in db.scalars(select(User).where(User.id.in_(uids))).all():
            login_by_uid[u.id] = u.login_id
    return lines_for_bets(db, bets, login_by_uid)
