"""B2B 분양 사이트(테넌트) 설정."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from sqlalchemy import Boolean, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class SiteConfig(Base):
    __tablename__ = "gp_site_configs"

    site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    site_name: Mapped[str] = mapped_column(String(128), nullable=False)

    is_casino_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_powerball_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_toto_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # 픽별 배당(예: {"pb_odd": "1.95", "sum_even": "1.9"}). 없으면 env 기본값.
    powerball_odds: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)

    # 종목별 배팅 한도: {"POWERBALL": {"min_bet": "100", "max_bet": "1000000"}, ...}
    bet_limits: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)

    # 사이트 운영 정책(레퍼런스 어드민「사이트 설정」에 대응). 구조는 docs/PRODUCT_NOTES_KO.md 참고.
    site_policies: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)

    users: Mapped[List["User"]] = relationship(back_populates="site")
