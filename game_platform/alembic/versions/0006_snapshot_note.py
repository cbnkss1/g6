"""gp_settlement_snapshots.note 컬럼 추가

Revision ID: 0006_snapshot_note
Revises: 0005_sports_toto
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0006_snapshot_note"
down_revision = "0005_sports_toto"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    if "gp_settlement_snapshots" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("gp_settlement_snapshots")}
        if "note" not in cols:
            op.add_column("gp_settlement_snapshots", sa.Column("note", sa.String(256), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    if "gp_settlement_snapshots" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("gp_settlement_snapshots")}
        if "note" in cols:
            op.drop_column("gp_settlement_snapshots", "note")
