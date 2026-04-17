"""파워볼 다종목: game_key (회차·배팅·상태 분리)

Revision ID: 0011_pb_multi
Revises: 0010_sports_ext
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0011_pb_multi"
down_revision = "0010_sports_ext"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    tables = set(insp.get_table_names())

    if "gp_powerball_game_state" not in tables:
        op.create_table(
            "gp_powerball_game_state",
            sa.Column("game_key", sa.String(32), primary_key=True),
            sa.Column("last_api_round", sa.BigInteger(), nullable=False, server_default="0"),
        )

    if "gp_powerball_state" in tables:
        op.execute(
            sa.text(
                """
                INSERT INTO gp_powerball_game_state (game_key, last_api_round)
                VALUES (
                    'coinpowerball3',
                    COALESCE((SELECT last_api_round FROM gp_powerball_state WHERE id = 1 LIMIT 1), 0)
                )
                ON CONFLICT (game_key) DO NOTHING
                """
            )
        )
    op.execute(
        sa.text(
            """
            INSERT INTO gp_powerball_game_state (game_key, last_api_round)
            VALUES ('coinpowerball3', 0)
            ON CONFLICT (game_key) DO NOTHING
            """
        )
    )

    if "gp_powerball_rounds" in tables:
        cols = {c["name"] for c in inspect(conn).get_columns("gp_powerball_rounds")}
        if "game_key" not in cols:
            op.add_column(
                "gp_powerball_rounds",
                sa.Column("game_key", sa.String(32), nullable=True),
            )
            op.execute(sa.text("UPDATE gp_powerball_rounds SET game_key = 'coinpowerball3' WHERE game_key IS NULL"))
            op.alter_column(
                "gp_powerball_rounds",
                "game_key",
                nullable=False,
                server_default="coinpowerball3",
            )
        try:
            op.drop_index("ix_gp_powerball_rounds_round_no", table_name="gp_powerball_rounds")
        except Exception:
            pass
        insp2 = inspect(conn)
        names = {i["name"] for i in insp2.get_indexes("gp_powerball_rounds")}
        if "uq_gp_powerball_rounds_game_round" not in names:
            try:
                op.create_index(
                    "uq_gp_powerball_rounds_game_round",
                    "gp_powerball_rounds",
                    ["game_key", "round_no"],
                    unique=True,
                )
            except Exception:
                pass
        if "ix_gp_powerball_rounds_game_key" not in names:
            try:
                op.create_index("ix_gp_powerball_rounds_game_key", "gp_powerball_rounds", ["game_key"])
            except Exception:
                pass

    if "gp_powerball_bets" in tables:
        cols_b = {c["name"] for c in inspect(conn).get_columns("gp_powerball_bets")}
        if "game_key" not in cols_b:
            op.add_column(
                "gp_powerball_bets",
                sa.Column("game_key", sa.String(32), nullable=True),
            )
            op.execute(sa.text("UPDATE gp_powerball_bets SET game_key = 'coinpowerball3' WHERE game_key IS NULL"))
            op.alter_column(
                "gp_powerball_bets",
                "game_key",
                nullable=False,
                server_default="coinpowerball3",
            )
        insp3 = inspect(conn)
        bnames = {i["name"] for i in insp3.get_indexes("gp_powerball_bets")}
        if "ix_gp_powerball_bets_game_key" not in bnames:
            try:
                op.create_index("ix_gp_powerball_bets_game_key", "gp_powerball_bets", ["game_key"])
            except Exception:
                pass

    if "gp_powerball_state" in tables:
        op.drop_table("gp_powerball_state")


def downgrade() -> None:
    op.create_table(
        "gp_powerball_state",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("last_api_round", sa.BigInteger(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        sa.text(
            "INSERT INTO gp_powerball_state (id, last_api_round) "
            "SELECT 1, COALESCE((SELECT last_api_round FROM gp_powerball_game_state WHERE game_key = 'coinpowerball3' LIMIT 1), 0)"
        )
    )
    op.drop_index("ix_gp_powerball_bets_game_key", table_name="gp_powerball_bets")
    op.drop_column("gp_powerball_bets", "game_key")
    op.drop_index("ix_gp_powerball_rounds_game_key", table_name="gp_powerball_rounds")
    op.drop_index("uq_gp_powerball_rounds_game_round", table_name="gp_powerball_rounds")
    op.create_index(
        "ix_gp_powerball_rounds_round_no",
        "gp_powerball_rounds",
        ["round_no"],
        unique=True,
    )
    op.drop_column("gp_powerball_rounds", "game_key")
    op.drop_table("gp_powerball_game_state")
