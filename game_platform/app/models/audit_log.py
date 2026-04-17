"""
Audit Log: 관리자 모든 활동을 수정 불가능한 레코드로 보존.
- 머니 수정, 설정 변경, 유저 생성/차단, 요율 변경, 배팅 취소 등.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AuditLog(Base):
    """
    INSERT-ONLY 테이블 (UPDATE/DELETE 금지 — 애플리케이션 레이어 강제).
    """
    __tablename__ = "gp_audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # 누가
    actor_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("gp_users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    actor_login_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    actor_role: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    actor_ip: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)  # IPv6 최대 45자

    # 언제
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    # 무엇을 (action category)
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # 어디서 (대상 리소스)
    target_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    target_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)

    # 상세 변경 내용 (JSON 문자열로 직렬화)
    before_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    after_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
