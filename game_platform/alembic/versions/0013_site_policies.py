"""사이트 운영 정책 JSON (점검·충환 시간·금액·레벨 보너스 등)

Revision ID: 0013_site_policies
Revises: 0012_bet_limits
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0013_site_policies"
down_revision = "0012_bet_limits"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "gp_site_configs",
        sa.Column("site_policies", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("gp_site_configs", "site_policies")
