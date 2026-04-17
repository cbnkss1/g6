from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class GameMoneyLedgerEntry(Base):
    """게임 머니 전용 원장(롤링 포인트와 테이블 분리)."""

    __tablename__ = "gp_game_money_ledger"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("gp_users.id", ondelete="CASCADE"), index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    delta: Mapped[Decimal] = mapped_column(Numeric(24, 6), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(24, 6), nullable=False)
    reason: Mapped[str] = mapped_column(String(32), nullable=False)
    reference_type: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    reference_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)

    user: Mapped[User] = relationship(
        back_populates="game_money_ledger",
        foreign_keys=[user_id],
    )


class RollingPointLedgerEntry(Base):
    """롤링 포인트 전용 원장(게임 머니와 테이블 분리)."""

    __tablename__ = "gp_rolling_point_ledger"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("gp_users.id", ondelete="CASCADE"), index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    delta: Mapped[Decimal] = mapped_column(Numeric(24, 6), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(24, 6), nullable=False)
    reason: Mapped[str] = mapped_column(String(32), nullable=False)
    reference_type: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    reference_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)

    user: Mapped[User] = relationship(
        back_populates="rolling_ledger",
        foreign_keys=[user_id],
    )
