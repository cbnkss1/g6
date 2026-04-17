"""
입출금 신청 모델.
- 입금 신청: DEPOSIT_REQUEST
- 출금 신청: WITHDRAW_REQUEST
- 상태: PENDING → PROCESSING(처리중) → APPROVED / REJECTED (또는 PENDING에서 바로 승인·거절 가능)
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class CashRequest(Base):
    """
    입출금 신청 테이블.
    승인/거절 시 game_money_ledger 에 연동 처리 (서비스 레이어).
    """
    __tablename__ = "gp_cash_requests"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("gp_users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    request_type: Mapped[str] = mapped_column(String(16), nullable=False)  # DEPOSIT / WITHDRAW
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING", index=True)

    amount: Mapped[Decimal] = mapped_column(Numeric(24, 6), nullable=False)

    # 입금자명, 계좌 메모 등 자유 입력
    memo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 처리한 관리자
    processed_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("gp_users.id", ondelete="SET NULL"), nullable=True
    )
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reject_reason: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)

    # 롤링 충족 계산을 위한 필요 배팅액 (입금 승인 시점에 계산)
    required_rolling_amount: Mapped[Decimal] = mapped_column(
        Numeric(24, 6), nullable=False, default=Decimal("0"), server_default="0"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    user: Mapped["User"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        foreign_keys=[user_id], back_populates="cash_requests"
    )
