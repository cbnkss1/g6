"""
스포츠 토토 전용 모델.

구조:
  SportsMatch  — 경기 1건 (상태: OPEN / CLOSED / SETTLED / CANCELLED)
  SportsOdds   — 경기별 배당 (승무패·스프레드·토탈 등)
  SportsSlip   — 배팅 슬립 (단폴 or 조합의 각 경기 선택)
  SportsBet    — 유저 배팅 1건 (1개 이상의 Slip 묶음)
  SportsTx     — 자금 이동 원장 (배팅, 당첨, 적특환불 등)

설계 원칙:
  - SportsTx는 모든 자금 흐름을 단일 테이블에 기록 (게임 종류 무관)
  - 정산 트랜잭션: FOR UPDATE 행 잠금 + 단일 commit
  - 적특(VOID): 즉시 환불 tx 생성 (amount = 원금, tx_type = VOID_REFUND)
  - 타이: tx_type = TIE_REFUND (롤링 0, 유효배팅 0)
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.user import User


# ─── 경기 ─────────────────────────────────────────────────────────────────────

class SportsMatch(Base):
    """스포츠 경기 1건."""
    __tablename__ = "gp_sports_matches"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # 외부 API에서 받는 경기 식별자
    external_match_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)

    sport_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)  # SOCCER, BASKETBALL, …
    league_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    home_team: Mapped[str] = mapped_column(String(128), nullable=False)
    away_team: Mapped[str] = mapped_column(String(128), nullable=False)

    match_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    # OPEN / CLOSED / SETTLED / CANCELLED
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="OPEN", index=True)

    # 경기 결과: HOME_WIN / DRAW / AWAY_WIN / CANCELLED / POSTPONED
    result: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    # 언더오버·스프레드 정산용 (선택)
    home_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    away_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    settled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    settled_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("gp_users.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    odds: Mapped[List["SportsOdds"]] = relationship(back_populates="match", cascade="all, delete-orphan")
    slips: Mapped[List["SportsSlip"]] = relationship(back_populates="match")


class SportsOdds(Base):
    """경기별 배당 (승무패·스프레드·토탈 등 outcome 키는 sports_market_codes 참고)."""
    __tablename__ = "gp_sports_odds"
    __table_args__ = (UniqueConstraint("match_id", "outcome", name="uq_gp_sports_odds"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("gp_sports_matches.id", ondelete="CASCADE"), index=True)
    outcome: Mapped[str] = mapped_column(String(64), nullable=False)
    odds_value: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False)

    match: Mapped["SportsMatch"] = relationship(back_populates="odds")


# ─── 배팅 ─────────────────────────────────────────────────────────────────────

class SportsBet(Base):
    """
    유저 배팅 1건 (단폴 or 조합).
    조합 배팅 시 단독 배당 = 각 slip 배당의 곱.
    """
    __tablename__ = "gp_sports_bets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("gp_users.id", ondelete="CASCADE"), index=True)

    stake: Mapped[Decimal] = mapped_column(Numeric(24, 6), nullable=False)
    # 배팅 시점 합산 배당 (슬립 배당의 곱)
    combined_odds: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=Decimal("1"))
    # 예상 당첨금 (stake × combined_odds), 실제 지급은 정산 후 확정
    potential_win: Mapped[Decimal] = mapped_column(Numeric(24, 6), nullable=False)

    # PENDING / PARTIAL_VOID / WON / LOST / VOIDED / CANCELLED
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING", index=True)

    win_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(24, 6), nullable=True)
    settled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    slips: Mapped[List["SportsSlip"]] = relationship(back_populates="bet", cascade="all, delete-orphan")
    txs: Mapped[List["SportsTx"]] = relationship(back_populates="bet")


class SportsSlip(Base):
    """
    배팅 슬립 — 배팅 1건 안의 경기 선택 1개.
    조합 = 1 SportsBet N SportsSlip.
    """
    __tablename__ = "gp_sports_slips"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    bet_id: Mapped[int] = mapped_column(ForeignKey("gp_sports_bets.id", ondelete="CASCADE"), index=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("gp_sports_matches.id", ondelete="RESTRICT"), index=True)

    selected_outcome: Mapped[str] = mapped_column(String(64), nullable=False)
    odds_at_bet: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False)

    # PENDING / WON / LOST / VOID (적특) / TIE / CANCELLED
    result: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    settled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    bet: Mapped["SportsBet"] = relationship(back_populates="slips")
    match: Mapped["SportsMatch"] = relationship(back_populates="slips")


# ─── 자금 원장 ────────────────────────────────────────────────────────────────

class SportsTx(Base):
    """
    스포츠 토토 자금 흐름 원장.
    tx_type:
      BET_STAKE       — 배팅 차감
      WIN_PAYOUT      — 당첨 지급
      VOID_REFUND     — 적특 환불 (1.0배 처리)
      TIE_REFUND      — 타이 환불 (롤링 0)
      CANCEL_REFUND   — 취소 환불
      ROLLING_CREDIT  — 롤링 포인트 적립 (referrer 계정)
    """
    __tablename__ = "gp_sports_txs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("gp_users.id", ondelete="CASCADE"), index=True)
    bet_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("gp_sports_bets.id", ondelete="SET NULL"), nullable=True, index=True
    )

    tx_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(24, 6), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(24, 6), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    bet: Mapped[Optional["SportsBet"]] = relationship(back_populates="txs")
