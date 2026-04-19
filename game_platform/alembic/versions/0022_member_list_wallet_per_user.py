"""gp_users: 회원별 회원목록 지급·회수 허용

Revision ID: 0022_member_list_wallet_per_user
Revises: 0021_team_role_label
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0022_member_list_wallet_per_user"
down_revision = "0021_team_role_label"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "gp_users",
        sa.Column(
            "member_list_wallet_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("gp_users", "member_list_wallet_enabled")
