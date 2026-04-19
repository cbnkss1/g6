"""메인 히어로 슬라이드 gp_home_hero_slides

Revision ID: 0024_gp_home_hero_slides
Revises: 0023_admin_partner_limited_ui
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0024_gp_home_hero_slides"
down_revision = "0023_admin_partner_limited_ui"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gp_home_hero_slides",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("site_id", sa.UUID(), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("subtitle", sa.String(length=2000), nullable=False),
        sa.Column("link_url", sa.Text(), nullable=True),
        sa.Column("device", sa.String(length=16), nullable=False, server_default="all"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
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
        sa.ForeignKeyConstraint(["site_id"], ["gp_site_configs.site_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_gp_home_hero_slides_site_id", "gp_home_hero_slides", ["site_id"])


def downgrade() -> None:
    op.drop_index("ix_gp_home_hero_slides_site_id", table_name="gp_home_hero_slides")
    op.drop_table("gp_home_hero_slides")
