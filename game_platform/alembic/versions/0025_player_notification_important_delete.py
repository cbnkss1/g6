"""쪽지 중요도·사용자 삭제(소프트)

Revision ID: 0025_player_notification_important_delete
Revises: 0024_gp_home_hero_slides
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0025_player_notification_important_delete"
down_revision = "0024_gp_home_hero_slides"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "gp_player_notifications",
        sa.Column(
            "is_important",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.add_column(
        "gp_player_notifications",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_gp_player_notifications_user_important_unread",
        "gp_player_notifications",
        ["user_id", "is_important", "read_at", "deleted_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_gp_player_notifications_user_important_unread", table_name="gp_player_notifications")
    op.drop_column("gp_player_notifications", "deleted_at")
    op.drop_column("gp_player_notifications", "is_important")
