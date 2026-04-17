"""스포츠 토토: gp_sports_matches, odds, bets, slips, txs

Revision ID: 0005_sports_toto
Revises: 0004_five_engines
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0005_sports_toto"
down_revision = "0004_five_engines"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    tables = set(insp.get_table_names())

    if "gp_sports_matches" not in tables:
        op.create_table(
            "gp_sports_matches",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("external_match_id", sa.String(64), nullable=False, unique=True),
            sa.Column("sport_type", sa.String(32), nullable=False),
            sa.Column("league_name", sa.String(128), nullable=True),
            sa.Column("home_team", sa.String(128), nullable=False),
            sa.Column("away_team", sa.String(128), nullable=False),
            sa.Column("match_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("status", sa.String(16), nullable=False, server_default="OPEN"),
            sa.Column("result", sa.String(32), nullable=True),
            sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("settled_by", sa.Integer(), sa.ForeignKey("gp_users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_gp_sports_matches_status", "gp_sports_matches", ["status"])
        op.create_index("ix_gp_sports_matches_match_at", "gp_sports_matches", ["match_at"])
        op.create_index("ix_gp_sports_matches_sport_type", "gp_sports_matches", ["sport_type"])

    if "gp_sports_odds" not in tables:
        op.create_table(
            "gp_sports_odds",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("match_id", sa.Integer(), sa.ForeignKey("gp_sports_matches.id", ondelete="CASCADE"), nullable=False),
            sa.Column("outcome", sa.String(16), nullable=False),
            sa.Column("odds_value", sa.Numeric(8, 4), nullable=False),
            sa.UniqueConstraint("match_id", "outcome", name="uq_gp_sports_odds"),
        )
        op.create_index("ix_gp_sports_odds_match_id", "gp_sports_odds", ["match_id"])

    if "gp_sports_bets" not in tables:
        op.create_table(
            "gp_sports_bets",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("gp_users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("stake", sa.Numeric(24, 6), nullable=False),
            sa.Column("combined_odds", sa.Numeric(12, 4), nullable=False, server_default="1"),
            sa.Column("potential_win", sa.Numeric(24, 6), nullable=False),
            sa.Column("status", sa.String(16), nullable=False, server_default="PENDING"),
            sa.Column("win_amount", sa.Numeric(24, 6), nullable=True),
            sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_gp_sports_bets_user_id", "gp_sports_bets", ["user_id"])
        op.create_index("ix_gp_sports_bets_status", "gp_sports_bets", ["status"])
        op.create_index("ix_gp_sports_bets_created_at", "gp_sports_bets", ["created_at"])

    if "gp_sports_slips" not in tables:
        op.create_table(
            "gp_sports_slips",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("bet_id", sa.Integer(), sa.ForeignKey("gp_sports_bets.id", ondelete="CASCADE"), nullable=False),
            sa.Column("match_id", sa.Integer(), sa.ForeignKey("gp_sports_matches.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("selected_outcome", sa.String(16), nullable=False),
            sa.Column("odds_at_bet", sa.Numeric(8, 4), nullable=False),
            sa.Column("result", sa.String(16), nullable=False, server_default="PENDING"),
            sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_gp_sports_slips_bet_id", "gp_sports_slips", ["bet_id"])
        op.create_index("ix_gp_sports_slips_match_id", "gp_sports_slips", ["match_id"])

    if "gp_sports_txs" not in tables:
        op.create_table(
            "gp_sports_txs",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("gp_users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("bet_id", sa.Integer(), sa.ForeignKey("gp_sports_bets.id", ondelete="SET NULL"), nullable=True),
            sa.Column("tx_type", sa.String(32), nullable=False),
            sa.Column("amount", sa.Numeric(24, 6), nullable=False),
            sa.Column("balance_after", sa.Numeric(24, 6), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_gp_sports_txs_user_id", "gp_sports_txs", ["user_id"])
        op.create_index("ix_gp_sports_txs_bet_id", "gp_sports_txs", ["bet_id"])
        op.create_index("ix_gp_sports_txs_tx_type", "gp_sports_txs", ["tx_type"])
        op.create_index("ix_gp_sports_txs_created_at", "gp_sports_txs", ["created_at"])


def downgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    tables = set(insp.get_table_names())
    for t in ["gp_sports_txs", "gp_sports_slips", "gp_sports_bets", "gp_sports_odds", "gp_sports_matches"]:
        if t in tables:
            op.drop_table(t)
