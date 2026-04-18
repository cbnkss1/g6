"""gp_support_tickets + gp_users.created_at / bad_actor

Revision ID: 0018_support_tickets
Revises: 0017_differential_commission_rates
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

revision = "0018_support_tickets_user_flags"
down_revision = "0017_differential_commission_rates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)

    if "gp_users" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("gp_users")}
        if "created_at" not in cols:
            op.add_column(
                "gp_users",
                sa.Column(
                    "created_at",
                    sa.DateTime(timezone=True),
                    server_default=sa.text("now()"),
                    nullable=True,
                ),
            )
        if "bad_actor" not in cols:
            op.add_column(
                "gp_users",
                sa.Column(
                    "bad_actor",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.text("false"),
                ),
            )

    if "gp_support_tickets" not in insp.get_table_names():
        op.create_table(
            "gp_support_tickets",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("gp_users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("site_id", sa.String(36), nullable=False),
            sa.Column("category", sa.String(32), nullable=False),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("attached_bet_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("status", sa.String(16), nullable=False, server_default="OPEN"),
            sa.Column("admin_reply", sa.Text(), nullable=True),
            sa.Column("replied_by_id", sa.Integer(), sa.ForeignKey("gp_users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("replied_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_gp_support_tickets_user_id", "gp_support_tickets", ["user_id"])
        op.create_index("ix_gp_support_tickets_site_id", "gp_support_tickets", ["site_id"])
        op.create_index("ix_gp_support_tickets_category", "gp_support_tickets", ["category"])
        op.create_index("ix_gp_support_tickets_status", "gp_support_tickets", ["status"])
        op.create_index("ix_gp_support_tickets_created_at", "gp_support_tickets", ["created_at"])


def downgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    if "gp_support_tickets" in insp.get_table_names():
        op.drop_table("gp_support_tickets")
    if "gp_users" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("gp_users")}
        if "bad_actor" in cols:
            op.drop_column("gp_users", "bad_actor")
        if "created_at" in cols:
            op.drop_column("gp_users", "created_at")
