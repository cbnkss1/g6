"""gp_users — 플레이어 프로필(은행·연락처 등)

Revision ID: 0009_player_profile
Revises: 0008_site_powerball_odds
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0009_player_profile"
down_revision = "0008_site_powerball_odds"
branch_labels = None
depends_on = None

_COLS = [
    ("bank_name", sa.String(64)),
    ("bank_account", sa.String(128)),
    ("account_holder", sa.String(64)),
    ("hashed_withdraw_password", sa.String(255)),
    ("phone", sa.String(32)),
    ("birth_ymd", sa.String(8)),
    ("gender", sa.String(16)),
    ("telecom_carrier", sa.String(16)),
    ("telegram_id", sa.String(64)),
]


def upgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    if "gp_users" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("gp_users")}
    for name, typ in _COLS:
        if name not in existing:
            op.add_column("gp_users", sa.Column(name, typ, nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    if "gp_users" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("gp_users")}
    for name, _ in reversed(_COLS):
        if name in existing:
            op.drop_column("gp_users", name)
