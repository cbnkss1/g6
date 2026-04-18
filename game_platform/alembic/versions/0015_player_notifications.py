"""플레이어 쪽지(관리자 알림)

Revision ID: 0015_player_notifications
Revises: 0014_member_level_admin_ip
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0015_player_notifications"
down_revision = "0014_member_level_admin_ip"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gp_player_notifications",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sender_admin_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["gp_users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sender_admin_id"], ["gp_users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_gp_player_notifications_user_id", "gp_player_notifications", ["user_id"])
    op.create_index("ix_gp_player_notifications_created_at", "gp_player_notifications", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_gp_player_notifications_created_at", table_name="gp_player_notifications")
    op.drop_index("ix_gp_player_notifications_user_id", table_name="gp_player_notifications")
    op.drop_table("gp_player_notifications")
