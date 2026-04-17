#!/usr/bin/env bash
# game_platform 연동 스모크 테스트
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PYTHONPATH="$ROOT"
export GAME_PLATFORM_ADMIN_API_TOKEN="${GAME_PLATFORM_ADMIN_API_TOKEN:-icheck_admin}"
export GAME_PLATFORM_INTERNAL_API_KEY="${GAME_PLATFORM_INTERNAL_API_KEY:-icheck_internal}"

echo "== Python import"
python3 -c "from app.main import app; print('routes:', len(app.routes))"

echo "== Uvicorn (백그라운드 → curl → 종료)"
nohup uvicorn app.main:app --host 127.0.0.1 --port 8100 > /tmp/gp_icheck.log 2>&1 &
UV_PID=$!
sleep 1
curl -sS http://127.0.0.1:8100/health
echo ""
curl -sS -o /dev/null -w "admin tree no auth: HTTP %{http_code} (expect 401)\n" \
  "http://127.0.0.1:8100/admin/agents/tree?root_id=1"
curl -sS -o /dev/null -w "internal settle no key: HTTP %{http_code} (expect 403)\n" \
  -X POST http://127.0.0.1:8100/internal/settle -H "Content-Type: application/json" -d '{}'
kill "$UV_PID" 2>/dev/null || true
wait "$UV_PID" 2>/dev/null || true

NODE_MAJ=$(node -p "parseInt(process.versions.node.split('.')[0],10)" 2>/dev/null || echo 0)
if [ "${NODE_MAJ}" -ge 18 ]; then
  echo "== Next build (web-admin)"
  cd "$ROOT/web-admin"
  npm run build
else
  echo "== Next build skipped (Node>=18 필요, 현재: $(node -v 2>/dev/null || echo 없음))"
fi

echo "== done"
