"""어드민 로그인 허용 IP (사이트 단위). 행이 하나도 없으면 제한 없음."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AdminAllowedIp(Base):
    __tablename__ = "gp_admin_allowed_ips"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("gp_site_configs.site_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ip_pattern: Mapped[str] = mapped_column(String(80), nullable=False)
    memo: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
