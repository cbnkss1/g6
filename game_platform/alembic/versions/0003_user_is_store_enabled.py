"""gp_users.is_store_enabled (오프라인 매장 스위치)

Revision ID: 0003_store
Revises: 0002_mt
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0003_store"
down_revision = "0002_mt"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    if "gp_users" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("gp_users")}
    if "is_store_enabled" not in cols:
        op.add_column(
            "gp_users",
            sa.Column(
                "is_store_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
        )


def downgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    if "gp_users" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("gp_users")}
    if "is_store_enabled" in cols:
        op.drop_column("gp_users", "is_store_enabled")
