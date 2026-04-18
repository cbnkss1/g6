"""플레이어 웹 레이어 팝업 (관리자 설정 → 공개 API로 노출)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SitePopup(Base):
    __tablename__ = "gp_site_popups"

    id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    site_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("gp_site_configs.site_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    device: Mapped[str] = mapped_column(String(16), nullable=False, default="all")
    nw_left: Mapped[int] = mapped_column(Integer(), nullable=False, default=50)
    nw_top: Mapped[int] = mapped_column(Integer(), nullable=False, default=80)
    nw_width: Mapped[int] = mapped_column(Integer(), nullable=False, default=420)
    nw_height: Mapped[int] = mapped_column(Integer(), nullable=False, default=360)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
