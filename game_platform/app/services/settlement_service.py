"""
게임 결과 수신 후 정산 파이프라인.
- 단일 DB 트랜잭션 + 행 잠금(SELECT FOR UPDATE)으로 동시 정산 방지.
- 롤링은 유효 배팅(Valid Bet)만 기준 — TIE·CANCEL·VOID·PUSH 등은 0원 처리.
- 추천인 롤링: 배팅 회원 본인 요율이 `partner_utils` 임계값 이상일 때만 upline 지급(역할 무관).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.bet import BetHistory
from app.models.enums import BetStatus, GameMoneyLedgerReason, GameResult, RollingPointLedgerReason
from app.models.ledger import GameMoneyLedgerEntry, RollingPointLedgerEntry
from app.models.settlement_snapshot import SettlementSnapshot
from app.models.user import User, UserGameRollingRate
from app.services.partner_utils import rolling_rate_qualifies_for_upline
from app.services.settlement_basis import valid_bet_amount_for_rolling


@dataclass(frozen=True)
class SettlementResult:
    ok: bool
    already_settled: bool
    bet_id: Optional[int]
    game_money_credited: Decimal
    rolling_credited_to_referrer: Decimal
    """롤링 계산에 사용된 유효 배팅액 (승·패만 스테이크, 그 외 0)."""
    valid_bet_for_rolling: Decimal
    detail: str


class SettlementService:
    """엔드포인트가 아닌 서비스 계층에서만 정산 로직을 수행."""

    @classmethod
    def settle_from_game_api(
        cls,
        db: Session,
        *,
        external_bet_uid: str,
        game_result: GameResult,
        win_amount: Decimal,
    ) -> SettlementResult:
        """
        외부 API에서 결과가 온 직후 호출.
        win_amount: 당첨/환불 등 호출측에서 결정한 게임머니 변동액(패배 0, 타이·취소 시 원금 반환 등).
        """
        win_amount = Decimal(win_amount).quantize(Decimal("0.000001"))

        bet = db.scalars(
            select(BetHistory)
            .where(BetHistory.external_bet_uid == external_bet_uid)
            .with_for_update()
        ).one_or_none()
        if bet is None:
            return SettlementResult(
                ok=False,
                already_settled=False,
                bet_id=None,
                game_money_credited=Decimal("0"),
                rolling_credited_to_referrer=Decimal("0"),
                valid_bet_for_rolling=Decimal("0"),
                detail="bet not found",
            )

        if bet.status == BetStatus.SETTLED.value:
            return SettlementResult(
                ok=True,
                already_settled=True,
                bet_id=bet.id,
                game_money_credited=Decimal("0"),
                rolling_credited_to_referrer=Decimal("0"),
                valid_bet_for_rolling=Decimal("0"),
                detail="already settled",
            )

        user = db.scalars(select(User).where(User.id == bet.user_id).with_for_update()).one()

        result_str = game_result.value
        valid_stake = valid_bet_amount_for_rolling(bet.bet_amount, result_str)

        rolling_to_referrer = Decimal("0")
        referrer = None
        if user.referrer_id is not None and valid_stake > 0:
            rate_row = db.scalars(
                select(UserGameRollingRate).where(
                    UserGameRollingRate.user_id == user.id,
                    UserGameRollingRate.game_type == bet.game_type,
                )
            ).one_or_none()
            rate_percent = rate_row.rate_percent if rate_row else Decimal("0")
            if rolling_rate_qualifies_for_upline(rate_percent):
                referrer = db.scalars(
                    select(User).where(User.id == user.referrer_id).with_for_update()
                ).one()
                rolling_to_referrer = (valid_stake * rate_percent / Decimal("100")).quantize(
                    Decimal("0.000001")
                )

        if win_amount != 0:
            new_bal = user.game_money_balance + win_amount
            user.game_money_balance = new_bal
            db.add(
                GameMoneyLedgerEntry(
                    user_id=user.id,
                    delta=win_amount,
                    balance_after=new_bal,
                    reason=GameMoneyLedgerReason.BET_WIN.value,
                    reference_type="BET",
                    reference_id=str(bet.id),
                )
            )

        if rolling_to_referrer > 0 and referrer is not None:
            new_r = referrer.rolling_point_balance + rolling_to_referrer
            referrer.rolling_point_balance = new_r
            db.add(
                RollingPointLedgerEntry(
                    user_id=referrer.id,
                    delta=rolling_to_referrer,
                    balance_after=new_r,
                    reason=RollingPointLedgerReason.REFERRAL_ROLLING.value,
                    reference_type="BET",
                    reference_id=str(bet.id),
                )
            )
            # 스냅샷 저장: 정산 요율 변경과 무관하게 당시 값 보존
            rate_row_snap = db.scalars(
                select(UserGameRollingRate).where(
                    UserGameRollingRate.user_id == user.id,
                    UserGameRollingRate.game_type == bet.game_type,
                )
            ).one_or_none()
            snap_rate = rate_row_snap.rate_percent if rate_row_snap else Decimal("0")
            db.add(
                SettlementSnapshot(
                    partner_user_id=referrer.id,
                    source_user_id=user.id,
                    bet_id=bet.id,
                    game_type=bet.game_type,
                    rate_percent_at_settlement=snap_rate,
                    valid_bet_amount=valid_stake,
                    rolling_credited=rolling_to_referrer,
                )
            )

        bet.status = BetStatus.SETTLED.value
        bet.win_amount = win_amount
        bet.game_result = result_str
        bet.settled_at = datetime.now(timezone.utc)

        return SettlementResult(
            ok=True,
            already_settled=False,
            bet_id=bet.id,
            game_money_credited=win_amount,
            rolling_credited_to_referrer=rolling_to_referrer,
            valid_bet_for_rolling=valid_stake,
            detail="settled",
        )

    @staticmethod
    def event_payload(result: SettlementResult) -> dict:
        """WebSocket/REST 응답용 직렬화 (Decimal → str)."""
        return {
            "ok": result.ok,
            "already_settled": result.already_settled,
            "bet_id": result.bet_id,
            "game_money_credited": str(result.game_money_credited),
            "rolling_credited_to_referrer": str(result.rolling_credited_to_referrer),
            "valid_bet_for_rolling": str(result.valid_bet_for_rolling),
            "detail": result.detail,
        }
