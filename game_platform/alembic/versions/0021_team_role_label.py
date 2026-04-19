"""gp_users: 파트너 트리 표시용 임의 직책 라벨

Revision ID: 0021_team_role_label
Revises: 0020_admin_member_ops_flags
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0021_team_role_label"
down_revision = "0020_admin_member_ops_flags"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "gp_users",
        sa.Column("team_role_label", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("gp_users", "team_role_label")
