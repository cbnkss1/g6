"""gp_site_configs + gp_users.site_id, hashed_password, role

Revision ID: 0002_mt
Revises: 0001_init_gp
Create Date: 2026-04-02

신규 DB에서 0001이 이미 최신 모델로 create_all 한 경우 컬럼이 있으면 스킵(멱등).
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

revision = "0002_mt"
down_revision = "0001_init_gp"
branch_labels = None
depends_on = None

DEFAULT_SITE_UUID = "a0000001-0000-4000-8000-000000000001"


def upgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    tables = set(insp.get_table_names())

    if "gp_site_configs" not in tables:
        op.create_table(
            "gp_site_configs",
            sa.Column("site_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("site_name", sa.String(128), nullable=False),
            sa.Column(
                "is_casino_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
            sa.Column(
                "is_powerball_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
            sa.Column(
                "is_toto_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.PrimaryKeyConstraint("site_id"),
        )
    # 0001 create_all 만 한 빈 테이블에도 기본 행 보장
    insp = inspect(conn)
    if "gp_site_configs" in insp.get_table_names():
        conn.execute(
            sa.text(
                """
                INSERT INTO gp_site_configs (
                    site_id, site_name, is_casino_enabled, is_powerball_enabled, is_toto_enabled
                ) VALUES (
                    CAST(:sid AS uuid), 'Default Site', true, true, true
                )
                ON CONFLICT (site_id) DO NOTHING
                """
            ),
            {"sid": DEFAULT_SITE_UUID},
        )

    insp = inspect(conn)
    if "gp_users" not in insp.get_table_names():
        return

    cols = {c["name"] for c in insp.get_columns("gp_users")}

    if "site_id" not in cols:
        op.add_column(
            "gp_users",
            sa.Column("site_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        conn.execute(
            sa.text(
                "UPDATE gp_users SET site_id = CAST(:sid AS uuid) WHERE site_id IS NULL"
            ),
            {"sid": DEFAULT_SITE_UUID},
        )
        op.alter_column("gp_users", "site_id", nullable=False)
        op.create_foreign_key(
            "fk_gp_users_site_id_gp_site_configs",
            "gp_users",
            "gp_site_configs",
            ["site_id"],
            ["site_id"],
            ondelete="RESTRICT",
        )

    insp = inspect(conn)
    cols = {c["name"] for c in insp.get_columns("gp_users")}

    if "hashed_password" not in cols:
        op.add_column(
            "gp_users",
            sa.Column("hashed_password", sa.String(255), nullable=True),
        )

    if "role" not in cols:
        op.add_column(
            "gp_users",
            sa.Column("role", sa.String(32), nullable=False, server_default="owner"),
        )

    insp = inspect(conn)
    if "gp_users" in insp.get_table_names():
        ucols = {c["name"] for c in insp.get_columns("gp_users")}
        if "site_id" in ucols:
            conn.execute(
                sa.text(
                    "UPDATE gp_users SET site_id = CAST(:sid AS uuid) WHERE site_id IS NULL"
                ),
                {"sid": DEFAULT_SITE_UUID},
            )


def downgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    if "gp_users" in insp.get_table_names():
        for fk in insp.get_foreign_keys("gp_users"):
            if fk.get("referred_table") == "gp_site_configs":
                op.drop_constraint(fk["name"], "gp_users", type_="foreignkey")
        cols = {c["name"] for c in insp.get_columns("gp_users")}
        if "hashed_password" in cols:
            op.drop_column("gp_users", "hashed_password")
        if "role" in cols:
            op.drop_column("gp_users", "role")
        if "site_id" in cols:
            op.drop_column("gp_users", "site_id")
    insp = inspect(conn)
    if "gp_site_configs" in insp.get_table_names():
        op.drop_table("gp_site_configs")
