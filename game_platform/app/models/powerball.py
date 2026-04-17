"""파워볼(코인파워볼 등) 회차·배팅 — 종목별 game_key 로 분리."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class PowerballGameState(Base):
    """종목별 마지막 API std_round — 다음 배팅 회차 = last_api_round + 1."""

    __tablename__ = "gp_powerball_game_state"

    game_key: Mapped[str] = mapped_column(String(32), primary_key=True)
    last_api_round: Mapped[int] = mapped_column(BigInteger(), nullable=False, default=0)


class PowerballRound(Base):
    __tablename__ = "gp_powerball_rounds"
    __table_args__ = (
        UniqueConstraint("game_key", "round_no", name="uq_gp_powerball_rounds_game_round"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    game_key: Mapped[str] = mapped_column(String(32), nullable=False, index=True, default="coinpowerball3")
    round_no: Mapped[int] = mapped_column(BigInteger(), nullable=False, index=True)
    num: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    pb: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    sum_val: Mapped[Optional[int]] = mapped_column("sum", Integer(), nullable=True)
    raw_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class PowerballBet(Base):
    __tablename__ = "gp_powerball_bets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("gp_users.id", ondelete="CASCADE"), index=True)
    game_key: Mapped[str] = mapped_column(String(32), nullable=False, index=True, default="coinpowerball3")
    round_no: Mapped[int] = mapped_column(BigInteger(), nullable=False, index=True)
    pick: Mapped[str] = mapped_column(String(64), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(24, 6), nullable=False)
    odds: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending", index=True)
    payout: Mapped[Optional[Decimal]] = mapped_column(Numeric(24, 6), nullable=True)
    settled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    user: Mapped[Optional["User"]] = relationship(foreign_keys=[user_id])
