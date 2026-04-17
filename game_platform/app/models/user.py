from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.bet import BetHistory
    from app.models.cash_request import CashRequest
    from app.models.ledger import GameMoneyLedgerEntry, RollingPointLedgerEntry
    from app.models.site_config import SiteConfig


class User(Base):
    """
    `referrer_id`: 상위(추천인) user id — 역할과 무관, 사이트 내 계정이면 누구나 가능.
    파트너 표시: `UserGameRollingRate`에 설정된 요율이 `partner_utils.MIN_PARTNER_ROLLING_PERCENT` 이상인 행이 있으면 True(역할 무관).
    `is_store_enabled`: 선불 P2P 지급/회수 허용 플래그.
    """

    __tablename__ = "gp_users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    login_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("gp_site_configs.site_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # 기본은 배팅 회원(player). 콘솔 운영(owner/staff/super_admin)은 생성 시 명시.
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="player")

    referrer_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("gp_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # 오프라인 매장(선불 지급/회수) — 슈퍼관리자만 토글
    is_store_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    # 2FA — Google OTP (TOTP)
    otp_secret: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    otp_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    # 계정 활성 상태
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    # 플레이어 보너스 정책(레벨 1~6 등). 어드민 계정은 기본 1.
    member_level: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    # 플레이어 회원가입 시 입력 (어드민/파트너 계정은 대개 비움)
    bank_name: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    bank_account: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    account_holder: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    hashed_withdraw_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    birth_ymd: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    telecom_carrier: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    telegram_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # 회원별 한도 오버라이드(비우면 사이트 기본만). 예: {"POWERBALL": {"max_bet": "5000000"}}
    bet_limits_override: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)

    game_money_balance: Mapped[Decimal] = mapped_column(
        Numeric(24, 6), nullable=False, default=Decimal("0")
    )
    rolling_point_balance: Mapped[Decimal] = mapped_column(
        Numeric(24, 6), nullable=False, default=Decimal("0")
    )

    referrer: Mapped[Optional["User"]] = relationship(
        remote_side=[id],
        foreign_keys=[referrer_id],
        back_populates="referrals",
    )
    referrals: Mapped[List["User"]] = relationship(
        foreign_keys=[referrer_id],
        back_populates="referrer",
    )

    rolling_rates: Mapped[List["UserGameRollingRate"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    game_money_ledger: Mapped[List["GameMoneyLedgerEntry"]] = relationship(
        back_populates="user",
        foreign_keys="GameMoneyLedgerEntry.user_id",
    )
    rolling_ledger: Mapped[List["RollingPointLedgerEntry"]] = relationship(
        back_populates="user",
        foreign_keys="RollingPointLedgerEntry.user_id",
    )
    bets: Mapped[List["BetHistory"]] = relationship(back_populates="user")

    cash_requests: Mapped[List["CashRequest"]] = relationship(
        foreign_keys="CashRequest.user_id",
        back_populates="user",
    )

    site: Mapped["SiteConfig"] = relationship(back_populates="users")


class UserGameRollingRate(Base):
    """
    배팅 유저 기준: (유저, 게임 종류)마다 추천인에게 지급할 롤링 비율(%).
    적립액 = 배팅금액 * (rate_percent / 100) — 정산 서비스에서 사용.
    """

    __tablename__ = "gp_user_game_rolling_rates"
    __table_args__ = (UniqueConstraint("user_id", "game_type", name="uq_gp_user_game_rate"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("gp_users.id", ondelete="CASCADE"), index=True)
    game_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    rate_percent: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)

    user: Mapped[User] = relationship(back_populates="rolling_rates")
