"""차액 정산: rolling_rate / losing_rate, upline_share 제거

Revision ID: 0017_differential_commission_rates
Revises: 0016_rolling_upline_share
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0017_differential_commission_rates"
down_revision = "0016b_alembic_ver_len"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE gp_user_game_rolling_rates RENAME COLUMN rate_percent TO rolling_rate_percent"
    )
    op.add_column(
        "gp_user_game_rolling_rates",
        sa.Column("losing_rate_percent", sa.Numeric(10, 4), nullable=False, server_default="0"),
    )
    op.execute("ALTER TABLE gp_user_game_rolling_rates ALTER COLUMN losing_rate_percent DROP DEFAULT")
    op.execute(
        "ALTER TABLE gp_user_game_rolling_rates DROP COLUMN IF EXISTS upline_share_percent"
    )


def downgrade() -> None:
    op.add_column(
        "gp_user_game_rolling_rates",
        sa.Column("upline_share_percent", sa.Numeric(10, 4), nullable=True),
    )
    op.drop_column("gp_user_game_rolling_rates", "losing_rate_percent")
    op.execute(
        "ALTER TABLE gp_user_game_rolling_rates RENAME COLUMN rolling_rate_percent TO rate_percent"
    )
