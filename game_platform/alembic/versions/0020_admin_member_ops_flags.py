"""gp_users: 파트너별 회원목록 지급·회수·상세수정 권한 플래그

Revision ID: 0020_admin_member_ops_flags
Revises: 0019_gp_site_popups
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0020_admin_member_ops_flags"
down_revision = "0019_gp_site_popups"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "gp_users",
        sa.Column(
            "admin_wallet_credit_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "gp_users",
        sa.Column(
            "admin_wallet_debit_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "gp_users",
        sa.Column(
            "admin_member_profile_edit_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("gp_users", "admin_member_profile_edit_enabled")
    op.drop_column("gp_users", "admin_wallet_debit_enabled")
    op.drop_column("gp_users", "admin_wallet_credit_enabled")
