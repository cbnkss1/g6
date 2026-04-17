"""파워볼 회차·배팅 테이블

Revision ID: 0007_powerball
Revises: 0006_snapshot_note
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007_powerball"
down_revision = "0006_snapshot_note"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gp_powerball_state",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("last_api_round", sa.BigInteger(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        sa.text(
            "INSERT INTO gp_powerball_state (id, last_api_round) VALUES (1, 0) "
            "ON CONFLICT (id) DO NOTHING"
        )
    )

    op.create_table(
        "gp_powerball_rounds",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("round_no", sa.BigInteger(), nullable=False),
        sa.Column("num", sa.Integer(), nullable=True),
        sa.Column("pb", sa.Integer(), nullable=True),
        sa.Column("sum", sa.Integer(), nullable=True),
        sa.Column("raw_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_gp_powerball_rounds_round_no", "gp_powerball_rounds", ["round_no"], unique=True)
    op.create_index("ix_gp_powerball_rounds_created_at", "gp_powerball_rounds", ["created_at"])

    op.create_table(
        "gp_powerball_bets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("round_no", sa.BigInteger(), nullable=False),
        sa.Column("pick", sa.String(64), nullable=False),
        sa.Column("amount", sa.Numeric(24, 6), nullable=False),
        sa.Column("odds", sa.Numeric(12, 4), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("payout", sa.Numeric(24, 6), nullable=True),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["gp_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_gp_powerball_bets_user_id", "gp_powerball_bets", ["user_id"])
    op.create_index("ix_gp_powerball_bets_round_no", "gp_powerball_bets", ["round_no"])
    op.create_index("ix_gp_powerball_bets_status", "gp_powerball_bets", ["status"])
    op.create_index("ix_gp_powerball_bets_created_at", "gp_powerball_bets", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_gp_powerball_bets_created_at", table_name="gp_powerball_bets")
    op.drop_index("ix_gp_powerball_bets_status", table_name="gp_powerball_bets")
    op.drop_index("ix_gp_powerball_bets_round_no", table_name="gp_powerball_bets")
    op.drop_index("ix_gp_powerball_bets_user_id", table_name="gp_powerball_bets")
    op.drop_table("gp_powerball_bets")
    op.drop_index("ix_gp_powerball_rounds_created_at", table_name="gp_powerball_rounds")
    op.drop_index("ix_gp_powerball_rounds_round_no", table_name="gp_powerball_rounds")
    op.drop_table("gp_powerball_rounds")
    op.drop_table("gp_powerball_state")
