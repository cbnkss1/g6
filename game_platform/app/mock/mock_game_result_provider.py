"""
외부 카지노/파워볼 API 없이 정산·롤링 로직을 검증하기 위한 가짜 결과 스트림.
"""
from __future__ import annotations

import random
import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional, Union

from app.models.enums import GameResult, GameType


@dataclass(frozen=True)
class MockGameResultPayload:
    external_bet_uid: str
    game_type: str
    result: GameResult
    win_amount: Decimal


class MockGameResultProvider:
    """테스트·로컬 개발용 랜덤 결과 생성기."""

    def __init__(self, seed: Optional[int] = None) -> None:
        self._rng = random.Random(seed)

    def next_payload(
        self,
        *,
        game_type: Union[GameType, str] = GameType.BACCARAT,
        stake: Decimal = Decimal("10000"),
    ) -> MockGameResultPayload:
        gt = game_type.value if isinstance(game_type, GameType) else str(game_type)
        outcomes = [GameResult.WIN, GameResult.LOSE, GameResult.TIE]
        weights = [0.4, 0.4, 0.2] if gt.upper() == "BACCARAT" else [0.45, 0.55]
        if len(weights) == 2:
            outcomes = [GameResult.WIN, GameResult.LOSE]
        result = self._rng.choices(outcomes, weights=weights, k=1)[0]

        if result == GameResult.WIN:
            win = stake * Decimal("1.95")
        elif result == GameResult.TIE and gt.upper() == "BACCARAT":
            win = stake
        else:
            win = Decimal("0")

        return MockGameResultPayload(
            external_bet_uid=str(uuid.uuid4()),
            game_type=gt,
            result=result,
            win_amount=win.quantize(Decimal("0.000001")),
        )
