from decimal import Decimal
from typing import List

from pydantic import BaseModel, Field


class RollingRateItem(BaseModel):
    game_type: str = Field(..., max_length=32)
    rolling_rate_percent: Decimal = Field(default=Decimal("0"), ge=0, description="롤링 %")
    losing_rate_percent: Decimal = Field(default=Decimal("0"), ge=0, description="루징 % (차액 정산)")


class RollingRatesUpdateBody(BaseModel):
    rates: List[RollingRateItem]


class SettlementRequestBody(BaseModel):
    external_bet_uid: str
    # WIN | LOSE | TIE | CANCEL | VOID | PUSH … (환불형은 롤링·유효배팅 0)
    game_result: str
    win_amount: Decimal = Decimal("0")
    # True면 Plxmed 카지노 지갑 등 — 메인 게임머니 입출금 없이 BetHistory·롤링만 반영
    wallet_neutral: bool = False


class PlaceBetRequestBody(BaseModel):
    user_id: int
    game_type: str = Field(..., max_length=32)
    stake: Decimal = Field(..., gt=0)
    external_bet_uid: str = Field(..., max_length=64)
    wallet_neutral: bool = False
