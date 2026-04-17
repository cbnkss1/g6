#!/usr/bin/env bash
# PostgreSQL 기동 후: game_platform DB에 gp_* 테이블 생성
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONPATH=.
alembic upgrade head
echo "alembic upgrade head 완료"
