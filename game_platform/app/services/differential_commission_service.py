"""
무한 뎁스 추천 트리 기준 정산 (Rolling + Losing).

롤링 (2단계)
  1) 본인 롤링(Self-Rolling): 배팅자 B의 요율 r_B > 0 이면
     유효 스테이크 × r_B / 100 을 B의 포인트에 SELF_ROLLING 으로 지급.
  2) 차액 롤링(Differential): 체인 [B, U1, U2, …] 에 대해
     U1 = 유효 스테이크 × (r_U1 − r_B) / 100, U2 = × (r_U2 − r_U1) / 100, …
     r_B = 0 이면 U1 이 유효 스테이크 × r_U1 / 100 (직하위 차감 없음).

  카지노·스포츠 계열 + 환불형 결과면 롤링 스테이크 0.
  미니게임은 `valid_stake_for_differential_rolling` 호출부 산정값 사용.

루징 (차액 죽장, `calculate_differential_losing` 산수와 동일)
  순손실 net_loss = 배팅금 − 당첨금 − 이번 정산에서 이미 지급된 전체 롤링(self+차액). **max(0,…) 금지** — 마이너스면 그대로.
  체인 [B, U1, …] 에 대해 child=chain[i], parent=chain[i+1]:
    diff_rate = losing%(parent) − losing%(child). **diff_rate > 0 일 때만** 지급(역전 요율 방어).
    payout = net_loss × (diff_rate / 100) — 음수면 원장·지갑에 그대로(상계/차감).

상향 체인: `fetch_upline_chain_ids` = [배팅자, 직상위, …] (배팅자가 index 0).
이후 동일 트랜잭션에서 사용자 행 FOR UPDATE.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, List, Optional, Tuple

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.enums import RollingPointLedgerReason
from app.models.ledger import RollingPointLedgerEntry
from app.models.settlement_snapshot import SettlementSnapshot
from app.models.user import User, UserGameRollingRate
from app.services.settlement_basis import (
    CASINO_OR_SPORTS_ROLLING,
    is_refund_like_result,
    normalize_game_result,
)

Q = Decimal("0.000001")
MAX_CHAIN_DEPTH = 32


def fetch_downline_user_ids(
    db: Session,
    root_user_id: int,
    *,
    site_id: Optional[str] = None,
    super_site_bypass: bool = True,
) -> List[int]:
    """
    Recursive CTE로 하부 전체 id 목록 1회 조회 (본인 포함).
    max depth 32 — 무한 루프·과도한 깊이 방지.
    """
    sql = text(
        """
        WITH RECURSIVE sub AS (
            SELECT id, 0 AS depth
            FROM gp_users
            WHERE id = :root_id
              AND (
                :super_site
                OR CAST(site_id AS text) = :site_id
              )
            UNION ALL
            SELECT u.id, sub.depth + 1
            FROM gp_users u
            INNER JOIN sub ON u.referrer_id = sub.id
            WHERE sub.depth < :max_depth
              AND (
                :super_site
                OR CAST(u.site_id AS text) = :site_id
              )
        )
        SELECT id FROM sub
        ORDER BY id
        """
    )
    rows = db.execute(
        sql,
        {
            "root_id": root_user_id,
            "max_depth": MAX_CHAIN_DEPTH,
            "site_id": (site_id or "").strip(),
            "super_site": super_site_bypass,
        },
    ).mappings().all()
    return [int(r["id"]) for r in rows]


def fetch_upline_chain_ids(db: Session, bettor_user_id: int) -> List[int]:
    """
    배팅자부터 상위로 referrer_id를 따라 올라가며 체인 [배팅자, 직상위, …].
    Step 1: Recursive CTE (max depth 32).
    """
    sql = text(
        """
        WITH RECURSIVE up_chain AS (
            SELECT id, referrer_id, 0 AS depth
            FROM gp_users
            WHERE id = :bettor_id
            UNION ALL
            SELECT u.id, u.referrer_id, c.depth + 1
            FROM gp_users u
            INNER JOIN up_chain c ON u.id = c.referrer_id
            WHERE c.depth < :max_depth
        )
        SELECT id FROM up_chain
        ORDER BY depth
        """
    )
    rows = db.execute(
        sql,
        {"bettor_id": bettor_user_id, "max_depth": MAX_CHAIN_DEPTH},
    ).mappings().all()
    return [int(r["id"]) for r in rows]


@dataclass(frozen=True)
class DifferentialCommissionResult:
    total_rolling_points: Decimal
    total_losing_points: Decimal
    beneficiary_count: int
    detail: str


class DifferentialCommissionService:
    """배팅 1건 기준 추천 체인(최대 32단) 본인 롤링·차액 롤링·루징."""

    @staticmethod
    def _lock_users_by_id_order(db: Session, user_ids: List[int]) -> Dict[int, User]:
        ordered = sorted(set(user_ids))
        out: Dict[int, User] = {}
        for uid in ordered:
            u = db.scalars(select(User).where(User.id == uid).with_for_update()).one()
            out[uid] = u
        return out

    @staticmethod
    def _load_rate_map(
        db: Session, user_ids: List[int], game_type: str
    ) -> Dict[int, Tuple[Decimal, Decimal]]:
        gt = game_type.strip().upper()[:32]
        rows = list(
            db.scalars(
                select(UserGameRollingRate).where(
                    UserGameRollingRate.user_id.in_(user_ids),
                    UserGameRollingRate.game_type == gt,
                )
            ).all()
        )
        m: Dict[int, Tuple[Decimal, Decimal]] = {uid: (Decimal("0"), Decimal("0")) for uid in user_ids}
        for r in rows:
            m[int(r.user_id)] = (
                Decimal(str(r.rolling_rate_percent)).quantize(Decimal("0.0001")),
                Decimal(str(r.losing_rate_percent)).quantize(Decimal("0.0001")),
            )
        return m

    @staticmethod
    def _effective_rolling_stake(
        game_type: str,
        game_result: Optional[str],
        valid_stake_for_rolling: Decimal,
    ) -> Decimal:
        """카지노·스포츠 + 타이/적특 → 롤링 스테이크 강제 0. 그 외는 호출부 산정값."""
        gt = game_type.strip().upper()[:32]
        gr = normalize_game_result(game_result)
        vs = Decimal(valid_stake_for_rolling).quantize(Q)
        if gt in CASINO_OR_SPORTS_ROLLING and is_refund_like_result(gr):
            return Decimal("0")
        return vs

    @classmethod
    def apply(
        cls,
        db: Session,
        *,
        bettor_user_id: int,
        game_type: str,
        valid_stake_for_rolling: Decimal,
        stake_amount: Decimal,
        win_amount: Decimal,
        bet_history_id: Optional[int],
        ledger_reference_type: str,
        ledger_reference_id: str,
        game_result: Optional[str] = None,
    ) -> DifferentialCommissionResult:
        """
        game_result: WIN/LOSE/TIE/VOID… (카지노·스포츠 롤링 예외·루징 순손실 판단에 사용)
        """
        stake = Decimal(stake_amount).quantize(Q)
        win = Decimal(win_amount).quantize(Q)
        ref_id_str = ledger_reference_id[:64]
        ref_type = ledger_reference_type[:32]
        gt_label = game_type.strip().upper()[:32]

        chain = fetch_upline_chain_ids(db, bettor_user_id)
        if not chain:
            return DifferentialCommissionResult(
                total_rolling_points=Decimal("0"),
                total_losing_points=Decimal("0"),
                beneficiary_count=0,
                detail="no_bettor",
            )

        users_by_id = cls._lock_users_by_id_order(db, chain)
        rate_map = cls._load_rate_map(db, chain, game_type)

        vs_roll = cls._effective_rolling_stake(
            game_type, game_result, valid_stake_for_rolling
        )

        total_r = Decimal("0")
        paid_recv: set[int] = set()

        # ── Step 1: 본인 롤링 (Self-Rolling) ────────────────────────────
        bettor_id = chain[0]
        r_b, _ = rate_map.get(bettor_id, (Decimal("0"), Decimal("0")))
        self_roll_amt = Decimal("0")
        if vs_roll > 0 and r_b > 0:
            self_roll_amt = (vs_roll * r_b / Decimal("100")).quantize(Q)
        if self_roll_amt > 0:
            bettor_u = users_by_id[bettor_id]
            bal_self = (bettor_u.rolling_point_balance + self_roll_amt).quantize(Q)
            db.add(
                RollingPointLedgerEntry(
                    user_id=bettor_id,
                    delta=self_roll_amt,
                    balance_after=bal_self,
                    reason=RollingPointLedgerReason.SELF_ROLLING.value,
                    reference_type=ref_type,
                    reference_id=ref_id_str,
                )
            )
            if bet_history_id is not None:
                db.add(
                    SettlementSnapshot(
                        partner_user_id=bettor_id,
                        source_user_id=bettor_user_id,
                        bet_id=bet_history_id,
                        game_type=gt_label,
                        rate_percent_at_settlement=r_b,
                        valid_bet_amount=vs_roll,
                        rolling_credited=self_roll_amt,
                    )
                )
            bettor_u.rolling_point_balance = bal_self
            total_r += self_roll_amt
            paid_recv.add(bettor_id)

        # ── Step 2: 차액 롤링 (Differential) — 아래=chain[i], 수령=chain[i+1] ─
        for i in range(len(chain) - 1):
            below_id = chain[i]
            recv_id = chain[i + 1]
            r_below, _ = rate_map.get(below_id, (Decimal("0"), Decimal("0")))
            r_recv, _ = rate_map.get(recv_id, (Decimal("0"), Decimal("0")))
            dr = (r_recv - r_below).quantize(Decimal("0.0001"))
            roll_amt = Decimal("0")
            if vs_roll > 0 and dr > 0:
                roll_amt = (vs_roll * dr / Decimal("100")).quantize(Q)

            if roll_amt <= 0:
                continue

            total_r += roll_amt
            paid_recv.add(recv_id)

            receiver = users_by_id[recv_id]
            bal = (receiver.rolling_point_balance + roll_amt).quantize(Q)
            db.add(
                RollingPointLedgerEntry(
                    user_id=receiver.id,
                    delta=roll_amt,
                    balance_after=bal,
                    reason=RollingPointLedgerReason.DIFFERENTIAL_ROLLING.value,
                    reference_type=ref_type,
                    reference_id=ref_id_str,
                )
            )
            if bet_history_id is not None:
                db.add(
                    SettlementSnapshot(
                        partner_user_id=receiver.id,
                        source_user_id=bettor_user_id,
                        bet_id=bet_history_id,
                        game_type=gt_label,
                        rate_percent_at_settlement=r_recv,
                        valid_bet_amount=vs_roll,
                        rolling_credited=roll_amt,
                    )
                )
            receiver.rolling_point_balance = bal

        # 순손실: total_bet - total_win - total_rolling_paid (이번 패스 지급 롤링 합). Clamp 금지.
        net_loss = (stake - win - total_r).quantize(Q)

        total_l = Decimal("0")

        # ── 차액 루징: diff_rate = l_parent - l_child > 0 일 때만 payout ─────
        for i in range(len(chain) - 1):
            child_id = chain[i]
            parent_id = chain[i + 1]
            _, l_child = rate_map.get(child_id, (Decimal("0"), Decimal("0")))
            _, l_parent = rate_map.get(parent_id, (Decimal("0"), Decimal("0")))
            diff_rate = (l_parent - l_child).quantize(Decimal("0.0001"))
            if diff_rate <= 0:
                continue
            lose_amt = (net_loss * diff_rate / Decimal("100")).quantize(Q)
            if lose_amt == 0:
                continue

            paid_recv.add(parent_id)

            receiver = users_by_id[parent_id]
            bal = (receiver.rolling_point_balance + lose_amt).quantize(Q)
            db.add(
                RollingPointLedgerEntry(
                    user_id=receiver.id,
                    delta=lose_amt,
                    balance_after=bal,
                    reason=RollingPointLedgerReason.DIFFERENTIAL_LOSING.value,
                    reference_type=ref_type,
                    reference_id=ref_id_str,
                )
            )
            receiver.rolling_point_balance = bal
            total_l += lose_amt

        return DifferentialCommissionResult(
            total_rolling_points=total_r,
            total_losing_points=total_l,
            beneficiary_count=len(paid_recv),
            detail="ok",
        )
