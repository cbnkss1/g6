"""관리자 → 플레이어 쪽지(알림)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PlayerNotification(Base):
    __tablename__ = "gp_player_notifications"

    id: Mapped[int] = mapped_column(BigInteger(), primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer(),
        ForeignKey("gp_users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    sender_admin_id: Mapped[Optional[int]] = mapped_column(
        Integer(),
        ForeignKey("gp_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
