"""원장 `reason` 코드 → 화면용 한글 라벨."""
from __future__ import annotations


def label_game_money_reason(reason: str) -> str:
    m = {
        "BET_STAKE": "스포츠·미니 배팅 (차감)",
        "BET_WIN": "스포츠·미니 당첨",
        "POWERBALL_STAKE": "파워볼 배팅 (차감)",
        "POWERBALL_WIN": "파워볼 당첨",
        "ADJUSTMENT": "조정",
        "ADMIN": "관리자 조정",
        "ADMIN_CREDIT": "관리자 지급 (입출금 승인 등)",
        "ADMIN_DEBIT": "관리자 회수 (입출금 승인 등)",
        "DEPOSIT_BONUS_FIRST": "첫충 보너스",
        "DEPOSIT_BONUS_REPEAT": "재충 보너스",
        "DEPOSIT_BONUS_REFERRAL": "추천인 충전 보너스",
        "AGENT_STORE_PAY_OUT": "매장 → 하부 지급",
        "AGENT_STORE_PAY_IN": "매장 ← 하부 입금",
        "AGENT_STORE_COLLECT_OUT": "매장 → 하부 회수(출금)",
        "AGENT_STORE_COLLECT_IN": "매장 ← 하부 회수(입금)",
        "CASINO_WALLET_DEPOSIT": "카지노 지갑 → 게임머니",
        "CASINO_WALLET_WITHDRAW": "게임머니 → 카지노 지갑",
        "CASINO_WALLET_DEPOSIT_REFUND": "카지노 입금 취소(환급)",
        "ROLLING_POINT_CONVERT": "포인트 → 게임머니 전환",
    }
    return m.get((reason or "").strip(), reason or "—")


def label_rolling_reason(reason: str) -> str:
    m = {
        "REFERRAL_ROLLING": "상위 롤링 적립(추천인)",
        "DIFFERENTIAL_ROLLING": "차액 롤링(추천 체인)",
        "DIFFERENTIAL_LOSING": "차액 루징(추천 체인)",
        "SELF_ROLLING": "본인 롤링 적립",
        "ADJUSTMENT": "조정",
        "ADMIN": "관리자 조정",
        "CONVERT_TO_GAME_MONEY": "포인트 → 게임머니 전환(차감)",
    }
    return m.get((reason or "").strip(), reason or "—")
