"""회원 레벨(보너스 테이블용) + 어드민 허용 IP

Revision ID: 0014_member_level_admin_ip
Revises: 0013_site_policies
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0014_member_level_admin_ip"
down_revision = "0013_site_policies"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "gp_users",
        sa.Column("member_level", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_table(
        "gp_admin_allowed_ips",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("site_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ip_pattern", sa.String(length=80), nullable=False),
        sa.Column("memo", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["site_id"], ["gp_site_configs.site_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("site_id", "ip_pattern", name="uq_gp_admin_allowed_ip_site_pattern"),
    )
    op.create_index("ix_gp_admin_allowed_ips_site_id", "gp_admin_allowed_ips", ["site_id"])


def downgrade() -> None:
    op.drop_index("ix_gp_admin_allowed_ips_site_id", table_name="gp_admin_allowed_ips")
    op.drop_table("gp_admin_allowed_ips")
    op.drop_column("gp_users", "member_level")
