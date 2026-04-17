"""gp_site_configs.powerball_odds JSONB — 픽별 파워볼 배당

Revision ID: 0008_site_powerball_odds
Revises: 0007_powerball
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0008_site_powerball_odds"
down_revision = "0007_powerball"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "gp_site_configs",
        sa.Column("powerball_odds", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("gp_site_configs", "powerball_odds")
