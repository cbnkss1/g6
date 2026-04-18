"""alembic_version.version_num 길이 확장 (32자 초과 revision id 지원)

Revision ID: 0016b_alembic_ver_len
Revises: 0016_rolling_upline_share
"""

from __future__ import annotations

from alembic import op

revision = "0016b_alembic_ver_len"
down_revision = "0016_rolling_upline_share"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128)")


def downgrade() -> None:
    op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(32)")
