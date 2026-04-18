"""1:1 고객센터 문의 티켓."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, List, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class SupportTicket(Base):
    __tablename__ = "gp_support_tickets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("gp_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    site_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    category: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    # gp_bet_history.id 목록 (JSON 배열)
    attached_bet_ids: Mapped[Optional[List[Any]]] = mapped_column(JSONB, nullable=True)

    status: Mapped[str] = mapped_column(String(16), nullable=False, default="OPEN", index=True)
    admin_reply: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    replied_by_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("gp_users.id", ondelete="SET NULL"), nullable=True
    )
    replied_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(foreign_keys=[user_id], back_populates="support_tickets")
