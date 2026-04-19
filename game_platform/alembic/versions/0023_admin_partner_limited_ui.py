"""gp_users: 하부 관리자(파트너) 제한 UI 플래그

Revision ID: 0023_admin_partner_limited_ui
Revises: 0022_member_list_wallet_per_user
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0023_admin_partner_limited_ui"
down_revision = "0022_member_list_wallet_per_user"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "gp_users",
        sa.Column(
            "admin_partner_limited_ui",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("gp_users", "admin_partner_limited_ui")
