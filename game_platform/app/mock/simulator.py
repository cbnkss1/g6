"""
가상 배팅 시뮬레이터: 서버가 떠 있는 동안 HTTP로
/internal/bootstrap-demo → /internal/place-bet → /internal/settle 호출.

실행 (터미널 2):
  cd game_platform && PYTHONPATH=. python -m app.mock.simulator

환경변수:
  GP_SIM_BASE_URL (기본 http://127.0.0.1:8100)
  GAME_PLATFORM_INTERNAL_API_KEY 또는 GP_INTERNAL_KEY
"""
from __future__ import annotations

import asyncio
import os
import random
import sys
import uuid
from decimal import Decimal

import httpx

from app.models.enums import GameResult

GAMES = ("BACCARAT", "SLOT", "POWERBALL")


def _win_amount(stake: Decimal, game: str, result: GameResult) -> Decimal:
    if result == GameResult.LOSE:
        return Decimal("0")
    if result in (GameResult.CANCEL, GameResult.VOID, GameResult.PUSH):
        return stake
    if result == GameResult.TIE and game == "BACCARAT":
        return stake
    if result == GameResult.WIN:
        return (stake * Decimal("1.95")).quantize(Decimal("0.000001"))
    return Decimal("0")


def _random_outcome(game: str) -> GameResult:
    if game == "BACCARAT":
        return random.choices(
            [GameResult.WIN, GameResult.LOSE, GameResult.TIE],
            weights=[0.42, 0.42, 0.16],
            k=1,
        )[0]
    return random.choices(
        [GameResult.WIN, GameResult.LOSE],
        weights=[0.45, 0.55],
        k=1,
    )[0]


async def run_loop() -> None:
    base = os.environ.get("GP_SIM_BASE_URL", "http://127.0.0.1:8100").rstrip("/")
    key = (
        os.environ.get("GP_INTERNAL_KEY")
        or os.environ.get("GAME_PLATFORM_INTERNAL_API_KEY")
        or ""
    ).strip()
    if not key:
        print("내부 키가 없습니다. GAME_PLATFORM_INTERNAL_API_KEY 또는 GP_INTERNAL_KEY 설정.", file=sys.stderr)
        sys.exit(1)

    headers = {"X-Internal-Key": key, "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(f"{base}/internal/bootstrap-demo", headers=headers)
        r.raise_for_status()
        boot = r.json()
        print("[sim] bootstrap:", boot)

        while True:
            delay = random.uniform(1.0, 3.0)
            await asyncio.sleep(delay)

            pr = await client.get(f"{base}/internal/players", headers=headers)
            pr.raise_for_status()
            players = pr.json().get("players") or []
            bettors = [p for p in players if str(p.get("login_id", "")).startswith("demo_player")]
            if not bettors:
                print("[sim] demo_player 없음 — bootstrap 확인")
                continue

            p = random.choice(bettors)
            uid = str(uuid.uuid4())
            stake = Decimal(random.randint(5_000, 80_000))
            game = random.choice(GAMES)

            pb = await client.post(
                f"{base}/internal/place-bet",
                headers=headers,
                json={
                    "user_id": p["id"],
                    "game_type": game,
                    "stake": str(stake),
                    "external_bet_uid": uid,
                },
            )
            if pb.status_code != 200:
                print("[sim] place-bet fail", pb.status_code, pb.text[:200])
                continue

            outcome = _random_outcome(game)
            win = _win_amount(stake, game, outcome)

            st = await client.post(
                f"{base}/internal/settle",
                headers=headers,
                json={
                    "external_bet_uid": uid,
                    "game_result": outcome.value,
                    "win_amount": str(win),
                },
            )
            if st.status_code != 200:
                print("[sim] settle fail", st.status_code, st.text[:200])
                continue

            data = st.json().get("result") or {}
            print(
                f"[sim] {game} uid={uid[:8]}… {outcome.value} stake={stake} win={win} "
                f"rolling+={data.get('rolling_credited_to_referrer', '?')}"
            )


def main() -> None:
    asyncio.run(run_loop())


if __name__ == "__main__":
    main()
