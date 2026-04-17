#!/usr/bin/env bash
# web-admin: 청크 누락(Cannot find module './NNN.js') 방지용 권장 절차
# 사용: cd game_platform/web-admin && bash scripts/rebuild-and-note.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "==> 제거: $ROOT/.next"
rm -rf .next
echo "==> 빌드"
npm run build
echo "==> 다음: next start(또는 systemd/pm2) 반드시 재시작. 이전 프로세스가 옛 .next 를 붙잡으면 동일 오류 재발."
