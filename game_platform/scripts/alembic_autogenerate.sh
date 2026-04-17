#!/usr/bin/env bash
# DB가 떠 있을 때만: 모델 diff로 새 리비전 생성 (운영 스키마 추적용)
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONPATH=.
alembic revision --autogenerate -m "${1:-schema_update}"
echo "생성됨: alembic/versions/ — 검토 후 alembic upgrade head"
