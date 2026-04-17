"""init gp_* tables from SQLAlchemy models

Revision ID: 0001_init_gp
Revises:
Create Date: 2026-04-03

Autogenerate 대신 모델 메타데이터로 일괄 생성 (초기 스키마).
"""
from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "0001_init_gp"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.models import Base

    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    from app.models import Base

    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
