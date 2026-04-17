"""
SLOTPASS 스포츠 토토 듀얼 정산 엔진.

트랙 A — 개별 정산 (settle_match)
  - 특정 match_id 의 결과를 수동 입력
  - 각 Slip 결과 판정 (WON / LOST / VOID / TIE / CANCELLED)
  - 조합 배팅: 모든 슬립 확정 후 최종 판정 (VOID 슬립은 1.0배로 처리)
  - SportsTx INSERT: WIN_PAYOUT / VOID_REFUND / TIE_REFUND
  - SettlementSnapshot INSERT: 정산 시점 요율 보존

트랙 B — 한방 정산 (bulk_settle_pending)
  - CLOSED 상태이며 result 확정된 모든 미정산 경기 일괄 처리
  - 1건 실패 → 전체 롤백 (Atomic Transaction 보장)
  - 진행 중 에러 수집 후 모두 성공 시에만 commit

공통 로직
  - 타이(TIE) / 적특(VOID): 유효배팅 0 → 롤링 없음
  - 롤링: 배팅 회원 본인의 SPORTS 요율이 임계값 이상이면 추천인(upline)에게 지급 (역할 무관, 동일 회원 모델)
  - R-스냅샷: SettlementSnapshot 에 요율·유효배팅·지급액 저장
  - AuditService 에 "SPORTS_SETTLE" 기록
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, ROUND_DOWN
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.settlement_snapshot import SettlementSnapshot
from app.models.sports import SportsBet, SportsMatch, SportsSlip, SportsTx
from app.models.user import User, UserGameRollingRate
from app.services.audit_service import AuditService
from app.services.partner_utils import rolling_rate_qualifies_for_upline
from app.services.sports_bet_history_bridge import sync_bet_history_after_sports_settle
from app.services.sports_market_codes import (
    is_known_extended_outcome,
    parse_spread_outcome,
    parse_total_outcome,
    slip_result_for_spread,
    slip_result_for_total_under_over,
)

GAME_TYPE_SPORTS = "SPORTS"
Q = Decimal("0.000001")

# ─── 슬립 결과 판정 ────────────────────────────────────────────────────────────

# 경기 결과 → 각 outcome 판정 매핑
# match_result: HOME_WIN / DRAW / AWAY_WIN / CANCELLED / POSTPONED / ABANDONED
_RESULT_MAP: Dict[str, Dict[str, str]] = {
    "HOME_WIN": {"HOME_WIN": "WON", "DRAW": "LOST", "AWAY_WIN": "LOST"},
    "DRAW":     {"HOME_WIN": "LOST", "DRAW": "WON", "AWAY_WIN": "LOST"},
    "AWAY_WIN": {"HOME_WIN": "LOST", "DRAW": "LOST", "AWAY_WIN": "WON"},
    # 아래 결과는 모든 선택이 VOID(적특) 처리
    "CANCELLED":  None,
    "POSTPONED":  None,
    "ABANDONED":  None,
    "NO_RESULT":  None,
}

_VOID_RESULTS = frozenset({"CANCELLED", "POSTPONED", "ABANDONED", "NO_RESULT"})
# 타이는 경기 전체 DRAW가 아닌, 특정 마켓에서 환불형 처리 — 여기서는 DRAW_TIE 로 구분
_TIE_RESULTS = frozenset({"TIE", "DRAW_TIE"})


def _slip_result_for_match(
    match_result: str,
    selected_outcome: str,
    *,
    home_score: Optional[int] = None,
    away_score: Optional[int] = None,
) -> str:
    """경기 결과 + 선택 → 슬립 결과 (WON/LOST/VOID/TIE)."""
    mr = match_result.strip().upper()
    sel = selected_outcome.strip().upper()
    if mr in _VOID_RESULTS:
        return "VOID"
    if mr in _TIE_RESULTS:
        return "TIE"

    if parse_total_outcome(sel):
        if home_score is None or away_score is None:
            return "VOID"
        return slip_result_for_total_under_over(home_score, away_score, sel)
    if parse_spread_outcome(sel):
        if home_score is None or away_score is None:
            return "VOID"
        return slip_result_for_spread(home_score, away_score, sel)

    mapping = _RESULT_MAP.get(mr)
    if mapping is None:
        return "VOID"  # 알 수 없는 결과 → 적특 처리
    return mapping.get(sel, "VOID")


def _is_rolling_eligible(slip_result: str) -> bool:
    """롤링 산정 가능한 결과 (WON/LOST만)."""
    return slip_result in ("WON", "LOST")


# ─── 배팅 최종 판정 ────────────────────────────────────────────────────────────

def _determine_bet_outcome(slips: List[SportsSlip]) -> Tuple[str, Decimal]:
    """
    조합 배팅 최종 판정.
    Returns (bet_status, effective_odds)
    - VOID:   모든 슬립이 VOID/CANCELLED
    - LOST:   LOST 슬립 1개라도 있으면 낙첨 (VOID 슬립은 1.0배)
    - WON:    모든 슬립이 WON (VOID는 1.0배로 처리)
    - CANCELLED: 전체 취소
    """
    results = [s.result for s in slips]

    # 전체 VOID / CANCELLED
    if all(r in ("VOID", "CANCELLED") for r in results):
        return "VOIDED", Decimal("1")

    # LOST 있으면 낙첨
    if "LOST" in results:
        return "LOST", Decimal("0")

    # TIE 처리: TIE 슬립은 1.0배로 계산, 나머지로 당첨 계산
    eff_odds = Decimal("1")
    for slip in slips:
        if slip.result == "WON":
            eff_odds *= Decimal(slip.odds_at_bet)
        elif slip.result in ("VOID", "TIE", "CANCELLED"):
            eff_odds *= Decimal("1")  # 적특/타이는 1.0배
        # LOST는 위에서 이미 처리됨
        # PENDING 슬립이 있으면 전체 PENDING 유지
        elif slip.result == "PENDING":
            return "PENDING", Decimal("1")

    return "WON", eff_odds.quantize(Decimal("0.0001"), rounding=ROUND_DOWN)


# ─── 롤링 산정 ────────────────────────────────────────────────────────────────

def _get_sports_rolling_rate(db: Session, user_id: int) -> Decimal:
    row = db.scalars(
        select(UserGameRollingRate).where(
            UserGameRollingRate.user_id == user_id,
            UserGameRollingRate.game_type == GAME_TYPE_SPORTS,
        )
    ).one_or_none()
    return row.rate_percent if row else Decimal("0")


# ─── 자금 처리 헬퍼 ───────────────────────────────────────────────────────────

def _credit_user(db: Session, user: User, amount: Decimal, bet_id: int, tx_type: str, note: str) -> SportsTx:
    new_bal = (user.game_money_balance + amount).quantize(Q)
    user.game_money_balance = new_bal
    tx = SportsTx(user_id=user.id, bet_id=bet_id, tx_type=tx_type,
                  amount=amount.quantize(Q), balance_after=new_bal, note=note)
    db.add(tx)
    return tx


def _credit_rolling(db: Session, referrer: User, amount: Decimal, bet_id: int) -> SportsTx:
    new_r = (referrer.rolling_point_balance + amount).quantize(Q)
    referrer.rolling_point_balance = new_r
    tx = SportsTx(user_id=referrer.id, bet_id=bet_id, tx_type="ROLLING_CREDIT",
                  amount=amount.quantize(Q), balance_after=new_r,
                  note=f"sports rolling from bet#{bet_id}")
    db.add(tx)
    return tx


def _add_snapshot(db: Session, *, partner_user_id: int, source_user_id: int,
                  bet_id: int, rate_percent: Decimal,
                  valid_bet: Decimal, rolling: Decimal, batch_key: Optional[str] = None) -> None:
    db.add(SettlementSnapshot(
        partner_user_id=partner_user_id,
        source_user_id=source_user_id,
        bet_id=None,  # sports bet id는 별도 테이블 — note에 기록
        game_type=GAME_TYPE_SPORTS,
        rate_percent_at_settlement=rate_percent,
        valid_bet_amount=valid_bet.quantize(Q),
        rolling_credited=rolling.quantize(Q),
        settlement_batch_key=batch_key,
        note=f"sports_bet#{bet_id}",
    ))


# ─── SettlementSnapshot 은 note 컬럼이 없으므로 패치 ─────────────────────────
# (기존 모델에 note 없음 → 안전하게 skip)
def _safe_snapshot(db, **kw):
    kw.pop("note", None)
    db.add(SettlementSnapshot(**kw))


# ─── 핵심: 단일 배팅 정산 ─────────────────────────────────────────────────────

@dataclass
class BetSettleResult:
    bet_id: int
    status: str
    win_amount: Decimal
    rolling_credited: Decimal
    valid_bet: Decimal
    skipped: bool = False
    error: Optional[str] = None


def _settle_one_bet(
    db: Session,
    bet: SportsBet,
    match: SportsMatch,
    batch_key: Optional[str] = None,
) -> BetSettleResult:
    """
    단일 SportsBet 정산.
    - 잠금: bet row 는 호출 전 FOR UPDATE 처리 필요 (bulk 는 직접, single 은 라우터에서)
    """
    if bet.status not in ("PENDING", "PARTIAL_VOID"):
        return BetSettleResult(
            bet_id=bet.id, status=bet.status,
            win_amount=Decimal("0"), rolling_credited=Decimal("0"),
            valid_bet=Decimal("0"), skipped=True,
        )

    now = datetime.now(timezone.utc)

    # ── 슬립 결과 판정 ──────────────────────────────────────────────────────
    for slip in bet.slips:
        if slip.match_id == match.id and slip.result == "PENDING":
            slip.result = _slip_result_for_match(
                match.result,
                slip.selected_outcome,
                home_score=match.home_score,
                away_score=match.away_score,
            )
            slip.settled_at = now

    # 아직 PENDING 슬립이 남아있으면 조합 배팅 미완성
    pending_slips = [s for s in bet.slips if s.result == "PENDING"]
    if pending_slips:
        bet.status = "PARTIAL_VOID"
        return BetSettleResult(
            bet_id=bet.id, status="PARTIAL_VOID",
            win_amount=Decimal("0"), rolling_credited=Decimal("0"),
            valid_bet=Decimal("0"), skipped=True,
        )

    # ── 최종 배팅 판정 ──────────────────────────────────────────────────────
    final_status, eff_odds = _determine_bet_outcome(bet.slips)
    user = db.scalars(select(User).where(User.id == bet.user_id).with_for_update()).one()

    win_amount = Decimal("0")
    rolling = Decimal("0")
    valid_bet = Decimal("0")

    if final_status == "WON":
        win_amount = (bet.stake * eff_odds).quantize(Q)
        valid_bet = bet.stake
        _credit_user(db, user, win_amount, bet.id, "WIN_PAYOUT",
                     f"sports bet#{bet.id} WON odds={eff_odds}")
    elif final_status == "LOST":
        valid_bet = bet.stake  # 유효배팅 — 롤링 산정
    elif final_status == "VOIDED":
        # 전체 적특: 원금 환불
        _credit_user(db, user, bet.stake, bet.id, "VOID_REFUND",
                     f"sports bet#{bet.id} VOIDED refund={bet.stake}")
    # 개별 TIE는 슬립 레벨에서 1.0배 처리됨

    # ── 롤링 산정 (WON/LOST 유효배팅 있을 때만) ─────────────────────────────
    if valid_bet > 0 and user.referrer_id:
        rate = _get_sports_rolling_rate(db, user.id)
        if rolling_rate_qualifies_for_upline(rate):
            referrer = db.scalars(
                select(User).where(User.id == user.referrer_id).with_for_update()
            ).one()
            rolling = (valid_bet * rate / Decimal("100")).quantize(Q)
            _credit_rolling(db, referrer, rolling, bet.id)
            _safe_snapshot(db,
                partner_user_id=referrer.id,
                source_user_id=user.id,
                bet_id=None,
                game_type=GAME_TYPE_SPORTS,
                rate_percent_at_settlement=rate,
                valid_bet_amount=valid_bet.quantize(Q),
                rolling_credited=rolling,
                settlement_batch_key=batch_key,
            )

    bet.status = final_status
    bet.win_amount = win_amount
    bet.settled_at = now

    if final_status in ("WON", "LOST", "VOIDED", "CANCELLED"):
        sync_bet_history_after_sports_settle(db, bet, settled_at=now)

    return BetSettleResult(
        bet_id=bet.id, status=final_status,
        win_amount=win_amount, rolling_credited=rolling, valid_bet=valid_bet,
    )


# ─── 트랙 A: 개별 경기 정산 ──────────────────────────────────────────────────

@dataclass
class MatchSettleReport:
    match_id: int
    match_result: str
    bets_processed: int
    bets_won: int
    bets_lost: int
    bets_voided: int
    bets_skipped: int
    total_payout: Decimal
    total_rolling: Decimal
    errors: List[str] = field(default_factory=list)


def settle_match(
    db: Session,
    *,
    match_id: int,
    match_result: str,
    actor: User,
    actor_ip: Optional[str] = None,
    home_score: Optional[int] = None,
    away_score: Optional[int] = None,
) -> MatchSettleReport:
    """
    트랙 A: 개별 경기 수동 정산.
    단일 트랜잭션 내에서 완료 — 호출 측에서 db.commit() 필요.
    """
    match = db.scalars(
        select(SportsMatch).where(SportsMatch.id == match_id).with_for_update()
    ).one_or_none()
    if match is None:
        raise ValueError(f"경기 없음: match_id={match_id}")
    if match.status == "SETTLED":
        raise ValueError(f"이미 정산된 경기: match_id={match_id}")

    slip_rows = list(
        db.scalars(select(SportsSlip).where(SportsSlip.match_id == match_id)).all()
    )
    needs_scores = any(is_known_extended_outcome(s.selected_outcome) for s in slip_rows)
    if needs_scores and (home_score is None or away_score is None):
        raise ValueError(
            "이 경기에 언더오버·스프레드 베팅이 있어 home_score·away_score(정수)가 필요합니다."
        )

    now = datetime.now(timezone.utc)
    match.result = match_result.strip().upper()
    if needs_scores:
        match.home_score = int(home_score)  # type: ignore[arg-type]
        match.away_score = int(away_score)  # type: ignore[arg-type]
    match.status = "SETTLED"
    match.settled_at = now
    match.settled_by = actor.id

    # 이 경기의 슬립을 가진 모든 배팅 조회
    affected_bet_ids = db.scalars(
        select(SportsSlip.bet_id)
        .where(SportsSlip.match_id == match_id)
        .distinct()
    ).all()

    report = MatchSettleReport(
        match_id=match_id, match_result=match_result,
        bets_processed=0, bets_won=0, bets_lost=0,
        bets_voided=0, bets_skipped=0,
        total_payout=Decimal("0"), total_rolling=Decimal("0"),
    )

    for bid in affected_bet_ids:
        bet = db.scalars(
            select(SportsBet)
            .where(SportsBet.id == bid)
            .with_for_update()
            .options()  # eager load slips below
        ).one_or_none()
        if bet is None:
            continue

        try:
            r = _settle_one_bet(db, bet, match, batch_key=None)
            report.bets_processed += 1
            if r.skipped:
                report.bets_skipped += 1
            elif r.status == "WON":
                report.bets_won += 1
                report.total_payout += r.win_amount
                report.total_rolling += r.rolling_credited
            elif r.status == "LOST":
                report.bets_lost += 1
                report.total_rolling += r.rolling_credited
            elif r.status == "VOIDED":
                report.bets_voided += 1
        except Exception as exc:
            report.errors.append(f"bet#{bid}: {exc}")

    AuditService.log(
        db, actor=actor, action="SPORTS_SETTLE",
        target_type="MATCH", target_id=str(match_id),
        before={"status": "OPEN/CLOSED"},
        after={"result": match_result, "bets_processed": report.bets_processed,
               "payout": str(report.total_payout)},
        actor_ip=actor_ip,
    )
    return report


# ─── 트랙 B: 한방 일괄 정산 ──────────────────────────────────────────────────

@dataclass
class BulkSettleReport:
    matches_processed: int
    matches_failed: int
    total_bets: int
    total_payout: Decimal
    total_rolling: Decimal
    errors: List[Dict[str, Any]] = field(default_factory=list)
    batch_key: str = ""


def bulk_settle_pending(
    db: Session,
    *,
    actor: User,
    actor_ip: Optional[str] = None,
) -> BulkSettleReport:
    """
    트랙 B: CLOSED & result 확정된 미정산 경기 전체 일괄 정산.

    원자성 보장:
      - 개별 경기 실패 시 해당 경기는 건너뛰고 errors에 기록
      - 모든 처리가 끝난 뒤 errors가 있으면 전체 롤백
      - 성공 시 일괄 commit (호출 측에서 수행)
    """
    import time
    batch_key = f"BULK_{int(time.time())}"

    pending_matches = db.scalars(
        select(SportsMatch)
        .where(
            SportsMatch.status == "CLOSED",
            SportsMatch.result.is_not(None),
        )
        .with_for_update(skip_locked=True)
    ).all()

    report = BulkSettleReport(
        matches_processed=0, matches_failed=0,
        total_bets=0, total_payout=Decimal("0"),
        total_rolling=Decimal("0"), batch_key=batch_key,
    )

    for match in pending_matches:
        try:
            r = settle_match(
                db, match_id=match.id,
                match_result=match.result,
                actor=actor, actor_ip=actor_ip,
                home_score=match.home_score,
                away_score=match.away_score,
            )
            report.matches_processed += 1
            report.total_bets += r.bets_processed
            report.total_payout += r.total_payout
            report.total_rolling += r.total_rolling
            if r.errors:
                report.errors.extend([{"match_id": match.id, "err": e} for e in r.errors])
        except Exception as exc:
            report.matches_failed += 1
            report.errors.append({"match_id": match.id, "err": str(exc)})

    # 1건이라도 match 레벨 실패 → 전체 롤백
    if report.matches_failed > 0:
        db.rollback()
        raise RuntimeError(
            f"한방 정산 롤백: {report.matches_failed}개 경기 실패. "
            f"errors={json.dumps(report.errors, ensure_ascii=False)}"
        )

    AuditService.log(
        db, actor=actor, action="SPORTS_BULK_SETTLE",
        target_type="BULK", target_id=batch_key,
        after={
            "matches": report.matches_processed,
            "bets": report.total_bets,
            "payout": str(report.total_payout),
            "rolling": str(report.total_rolling),
        },
        actor_ip=actor_ip,
    )
    return report
