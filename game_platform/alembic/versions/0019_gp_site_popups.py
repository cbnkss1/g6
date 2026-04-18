"""레이어 팝업 gp_site_popups

Revision ID: 0019_gp_site_popups
Revises: 0018_support_tickets_user_flags
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0019_gp_site_popups"
down_revision = "0018_support_tickets_user_flags"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gp_site_popups",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "site_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("gp_site_configs.site_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body_html", sa.Text(), nullable=False),
        sa.Column("device", sa.String(16), nullable=False, server_default="all"),
        sa.Column("nw_left", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("nw_top", sa.Integer(), nullable=False, server_default="80"),
        sa.Column("nw_width", sa.Integer(), nullable=False, server_default="420"),
        sa.Column("nw_height", sa.Integer(), nullable=False, server_default="360"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_gp_site_popups_site_id", "gp_site_popups", ["site_id"])


def downgrade() -> None:
    op.drop_index("ix_gp_site_popups_site_id", table_name="gp_site_popups")
    op.drop_table("gp_site_popups")
