import enum


class BetStatus(str, enum.Enum):
    PENDING = "PENDING"
    SETTLED = "SETTLED"


class GameResult(str, enum.Enum):
    WIN = "WIN"
    LOSE = "LOSE"
    TIE = "TIE"
    CANCEL = "CANCEL"
    VOID = "VOID"
    PUSH = "PUSH"

    @classmethod
    def parse(cls, raw: str) -> "GameResult":
        key = (raw or "").strip().upper()
        for m in cls:
            if m.value == key:
                return m
        raise ValueError(f"unknown game_result: {raw!r}")


class GameType(str, enum.Enum):
    """외부 API·운영 정의와 맞출 때 문자열 값만 동기화하면 됨."""

    BACCARAT = "BACCARAT"
    POWERBALL = "POWERBALL"
    MINIGAME_GENERIC = "MINIGAME_GENERIC"


class GameMoneyLedgerReason(str, enum.Enum):
    BET_STAKE = "BET_STAKE"
    BET_WIN = "BET_WIN"
    POWERBALL_STAKE = "POWERBALL_STAKE"
    POWERBALL_WIN = "POWERBALL_WIN"
    ADJUSTMENT = "ADJUSTMENT"
    ADMIN = "ADMIN"
    # 입출금 승인 시 원장 (ADMIN 과 별도 값)
    ADMIN_CREDIT = "ADMIN_CREDIT"
    ADMIN_DEBIT = "ADMIN_DEBIT"
    # 입금 승인 시 사이트 정책 보너스
    DEPOSIT_BONUS_FIRST = "DEPOSIT_BONUS_FIRST"
    DEPOSIT_BONUS_REPEAT = "DEPOSIT_BONUS_REPEAT"
    DEPOSIT_BONUS_REFERRAL = "DEPOSIT_BONUS_REFERRAL"
    # 에이전트 선불 P2P (매장 → 하부 / 하부 → 매장)
    AGENT_STORE_PAY_OUT = "AGENT_STORE_PAY_OUT"
    AGENT_STORE_PAY_IN = "AGENT_STORE_PAY_IN"
    AGENT_STORE_COLLECT_OUT = "AGENT_STORE_COLLECT_OUT"
    AGENT_STORE_COLLECT_IN = "AGENT_STORE_COLLECT_IN"
    # 메인 게임머니 ↔ Plxmed 카지노 지갑
    CASINO_WALLET_DEPOSIT = "CASINO_WALLET_DEPOSIT"
    CASINO_WALLET_WITHDRAW = "CASINO_WALLET_WITHDRAW"
    CASINO_WALLET_DEPOSIT_REFUND = "CASINO_WALLET_DEPOSIT_REFUND"
    ROLLING_POINT_CONVERT = "ROLLING_POINT_CONVERT"


class RollingPointLedgerReason(str, enum.Enum):
    """롤링 포인트 원장 reason — DB 문자열과 동일해야 함."""

    REFERRAL_ROLLING = "REFERRAL_ROLLING"
    SELF_ROLLING = "SELF_ROLLING"
    DIFFERENTIAL_ROLLING = "DIFFERENTIAL_ROLLING"
    DIFFERENTIAL_LOSING = "DIFFERENTIAL_LOSING"
    ADJUSTMENT = "ADJUSTMENT"
    ADMIN = "ADMIN"
    CONVERT_TO_GAME_MONEY = "CONVERT_TO_GAME_MONEY"
