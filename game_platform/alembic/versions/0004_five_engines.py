"""SLOTPASS 5대 엔진: audit_log, settlement_snapshot, cash_requests, user.otp/is_active

Revision ID: 0004_five_engines
Revises: 0003_store
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect, text

revision = "0004_five_engines"
down_revision = "0003_store"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    tables = set(insp.get_table_names())

    # ── 1. gp_users 컬럼 추가 ────────────────────────────────────────────────
    if "gp_users" in tables:
        cols = {c["name"] for c in insp.get_columns("gp_users")}
        if "otp_secret" not in cols:
            op.add_column("gp_users", sa.Column("otp_secret", sa.String(64), nullable=True))
        if "otp_enabled" not in cols:
            op.add_column(
                "gp_users",
                sa.Column("otp_enabled", sa.Boolean(), nullable=False, server_default=text("false")),
            )
        if "is_active" not in cols:
            op.add_column(
                "gp_users",
                sa.Column("is_active", sa.Boolean(), nullable=False, server_default=text("true")),
            )

    # ── 2. gp_audit_logs ─────────────────────────────────────────────────────
    if "gp_audit_logs" not in tables:
        op.create_table(
            "gp_audit_logs",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("gp_users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("actor_login_id", sa.String(64), nullable=True),
            sa.Column("actor_role", sa.String(32), nullable=True),
            sa.Column("actor_ip", sa.String(45), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("action", sa.String(64), nullable=False),
            sa.Column("target_type", sa.String(64), nullable=True),
            sa.Column("target_id", sa.String(64), nullable=True),
            sa.Column("before_json", sa.Text(), nullable=True),
            sa.Column("after_json", sa.Text(), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
        )
        op.create_index("ix_gp_audit_logs_created_at", "gp_audit_logs", ["created_at"])
        op.create_index("ix_gp_audit_logs_actor_user_id", "gp_audit_logs", ["actor_user_id"])
        op.create_index("ix_gp_audit_logs_action", "gp_audit_logs", ["action"])
        op.create_index("ix_gp_audit_logs_target_id", "gp_audit_logs", ["target_id"])

    # ── 3. gp_settlement_snapshots ───────────────────────────────────────────
    if "gp_settlement_snapshots" not in tables:
        op.create_table(
            "gp_settlement_snapshots",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("partner_user_id", sa.Integer(), sa.ForeignKey("gp_users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("source_user_id", sa.Integer(), sa.ForeignKey("gp_users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("bet_id", sa.Integer(), sa.ForeignKey("gp_bet_history.id", ondelete="SET NULL"), nullable=True),
            sa.Column("game_type", sa.String(32), nullable=False),
            sa.Column("rate_percent_at_settlement", sa.Numeric(10, 4), nullable=False),
            sa.Column("valid_bet_amount", sa.Numeric(24, 6), nullable=False),
            sa.Column("rolling_credited", sa.Numeric(24, 6), nullable=False),
            sa.Column("settled_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("settlement_batch_key", sa.String(32), nullable=True),
        )
        op.create_index("ix_gp_settlement_snapshots_partner_user_id", "gp_settlement_snapshots", ["partner_user_id"])
        op.create_index("ix_gp_settlement_snapshots_settled_at", "gp_settlement_snapshots", ["settled_at"])
        op.create_index("ix_gp_settlement_snapshots_batch_key", "gp_settlement_snapshots", ["settlement_batch_key"])

    # ── 4. gp_cash_requests ──────────────────────────────────────────────────
    if "gp_cash_requests" not in tables:
        op.create_table(
            "gp_cash_requests",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("gp_users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("request_type", sa.String(16), nullable=False),
            sa.Column("status", sa.String(16), nullable=False, server_default="PENDING"),
            sa.Column("amount", sa.Numeric(24, 6), nullable=False),
            sa.Column("memo", sa.Text(), nullable=True),
            sa.Column("processed_by", sa.Integer(), sa.ForeignKey("gp_users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("reject_reason", sa.String(256), nullable=True),
            sa.Column("required_rolling_amount", sa.Numeric(24, 6), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_gp_cash_requests_user_id", "gp_cash_requests", ["user_id"])
        op.create_index("ix_gp_cash_requests_status", "gp_cash_requests", ["status"])
        op.create_index("ix_gp_cash_requests_created_at", "gp_cash_requests", ["created_at"])


def downgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    tables = set(insp.get_table_names())

    if "gp_cash_requests" in tables:
        op.drop_table("gp_cash_requests")
    if "gp_settlement_snapshots" in tables:
        op.drop_table("gp_settlement_snapshots")
    if "gp_audit_logs" in tables:
        op.drop_table("gp_audit_logs")

    if "gp_users" in tables:
        cols = {c["name"] for c in insp.get_columns("gp_users")}
        for col in ("is_active", "otp_enabled", "otp_secret"):
            if col in cols:
                op.drop_column("gp_users", col)
