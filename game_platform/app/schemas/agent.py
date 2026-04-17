from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class AgentTransferBody(BaseModel):
    direction: Literal["pay", "collect"]
    counterparty_user_id: int = Field(..., ge=1)
    amount: Decimal = Field(..., gt=0)


class StoreEnabledBody(BaseModel):
    is_store_enabled: bool
