"""사이트·회원 배팅 한도 (종목별 min / 1회 max)

Revision ID: 0012_bet_limits
Revises: 0011_pb_multi
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0012_bet_limits"
down_revision = "0011_pb_multi"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "gp_site_configs",
        sa.Column("bet_limits", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "gp_users",
        sa.Column("bet_limits_override", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("gp_users", "bet_limits_override")
    op.drop_column("gp_site_configs", "bet_limits")
