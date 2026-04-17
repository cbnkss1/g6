from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class BetHistory(Base):
    """
    배팅 1건당 1행. 정산 전 PENDING, 완료 후 SETTLED.
    중복 정산 방지: status 전이는 FOR UPDATE 후 단 한 번만 허용.
    """

    __tablename__ = "gp_bet_history"
    __table_args__ = (
        UniqueConstraint("external_bet_uid", name="uq_gp_bet_external_uid"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    external_bet_uid: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    user_id: Mapped[int] = mapped_column(ForeignKey("gp_users.id", ondelete="CASCADE"), index=True)
    game_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)

    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING", index=True)
    bet_amount: Mapped[Decimal] = mapped_column(Numeric(24, 6), nullable=False)
    win_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(24, 6), nullable=True)
    # WIN, LOSE, TIE, CANCEL, VOID, PUSH … (집계: 총배팅=전부, 유효배팅=WIN·LOSE만)
    game_result: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    settled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="bets")
