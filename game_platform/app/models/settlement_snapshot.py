"""
정산 스냅샷: 정산 실행 시점의 요율·배팅·지급액을 불변 레코드로 보존.
요율이 나중에 변경돼도 과거 데이터는 그대로 유지.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SettlementSnapshot(Base):
    """
    파트너 롤링 지급 확정 스냅샷.
    - partner_user_id : 지급 받는 파트너
    - source_user_id  : 배팅한 하부 유저
    - bet_id          : BetHistory.id
    - game_type       : 게임 종류 (스냅샷 당시 값)
    - rate_percent_at_settlement : 적용 요율 (스냅샷 당시 값)
    - valid_bet_amount : TIE·CANCEL 제외 유효 배팅액
    - rolling_credited : 실제 지급된 롤링 포인트
    - settled_at       : 정산 확정 시각
    """
    __tablename__ = "gp_settlement_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    partner_user_id: Mapped[int] = mapped_column(
        ForeignKey("gp_users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_user_id: Mapped[int] = mapped_column(
        ForeignKey("gp_users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    bet_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("gp_bet_history.id", ondelete="SET NULL"), nullable=True, index=True
    )

    game_type: Mapped[str] = mapped_column(String(32), nullable=False)
    rate_percent_at_settlement: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    valid_bet_amount: Mapped[Decimal] = mapped_column(Numeric(24, 6), nullable=False)
    rolling_credited: Mapped[Decimal] = mapped_column(Numeric(24, 6), nullable=False)

    settled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    # 정산 배치 식별자 (일/주/월 배치 구분)
    settlement_batch_key: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)

    # 추가 메모 (sports_bet#id 등)
    note: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
