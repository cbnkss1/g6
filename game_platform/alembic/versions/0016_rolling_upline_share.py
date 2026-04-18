"""gp_user_game_rolling_rates: 하부 있을 때 상위 몫(upline_share_percent)

Revision ID: 0016_rolling_upline_share
Revises: 0015_player_notifications
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0016_rolling_upline_share"
down_revision = "0015_player_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "gp_user_game_rolling_rates",
        sa.Column("upline_share_percent", sa.Numeric(10, 4), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("gp_user_game_rolling_rates", "upline_share_percent")
