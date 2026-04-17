"""스포츠 토토: 확장 마켓(outcome 길이), 경기 스코어 컬럼

Revision ID: 0010_sports_ext
Revises: 0009_player_profile
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0010_sports_ext"
down_revision = "0009_player_profile"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    cols = {c["name"] for c in insp.get_columns("gp_sports_matches")}
    if "home_score" not in cols:
        op.add_column(
            "gp_sports_matches",
            sa.Column("home_score", sa.Integer(), nullable=True),
        )
    if "away_score" not in cols:
        op.add_column(
            "gp_sports_matches",
            sa.Column("away_score", sa.Integer(), nullable=True),
        )

    op.execute(
        "ALTER TABLE gp_sports_odds ALTER COLUMN outcome TYPE VARCHAR(64)"
    )
    op.execute(
        "ALTER TABLE gp_sports_slips ALTER COLUMN selected_outcome TYPE VARCHAR(64)"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE gp_sports_slips ALTER COLUMN selected_outcome TYPE VARCHAR(16)"
    )
    op.execute(
        "ALTER TABLE gp_sports_odds ALTER COLUMN outcome TYPE VARCHAR(16)"
    )
    op.drop_column("gp_sports_matches", "away_score")
    op.drop_column("gp_sports_matches", "home_score")
