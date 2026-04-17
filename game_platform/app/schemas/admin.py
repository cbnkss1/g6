from decimal import Decimal
from typing import List

from pydantic import BaseModel, Field


class RollingRateItem(BaseModel):
    game_type: str = Field(..., max_length=32)
    rate_percent: Decimal = Field(..., ge=0)


class RollingRatesUpdateBody(BaseModel):
    rates: List[RollingRateItem]


class SettlementRequestBody(BaseModel):
    external_bet_uid: str
    # WIN | LOSE | TIE | CANCEL | VOID | PUSH … (환불형은 롤링·유효배팅 0)
    game_result: str
    win_amount: Decimal = Decimal("0")


class PlaceBetRequestBody(BaseModel):
    user_id: int
    game_type: str = Field(..., max_length=32)
    stake: Decimal = Field(..., gt=0)
    external_bet_uid: str = Field(..., max_length=64)
