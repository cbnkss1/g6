"""
Plxmed Casino API 요청/응답 Pydantic 모델.

스키마는 에이전트 패널(https://bpcl.plxmed.com) 로그인 후 «API 문서»·PLEXApi 페이지와 대조.
REST 베이스는 game_platform 설정 PLXMED_API_BASE(예: …/api/v1/plexApi).
"""
from typing import Any, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
import re


# ---------------------------------------------------------------------------
# 공통 응답  (status: '0'=성공 / '1'=실패, code: 'SUCCESS' / 'FAILED')
# ---------------------------------------------------------------------------

class CasinoBaseResponse(BaseModel):
    """Plxmed API 공통 응답 래퍼."""
    status: Optional[str] = None     # '0' = 성공, '1' = 실패
    code: Optional[str] = None       # 'SUCCESS' 또는 'FAILED'
    message: Optional[str] = None
    data: Optional[Any] = None


# ---------------------------------------------------------------------------
# /createaccount — 계정 생성
# ---------------------------------------------------------------------------

class CreateAccountRequest(BaseModel):
    """
    계정 생성 요청. (문서 스키마 확정)

    username  : 영문 소문자 + 숫자만, 로그인 자격 증명 고유 식별자
    password  : 최소 6자, 영문 소문자 + 숫자만
    email     : 이메일 형식
    first_name: 영문만 (a-z)
    last_name : 빈 문자열("") 허용
    mobile_no : 숫자만 (Integer)
    """
    username: str = Field(..., description="영문 소문자 및 숫자만, 로그인 고유 식별자")
    password: str = Field(..., min_length=6, description="최소 6자, 영문 소문자 및 숫자만")
    email: EmailStr = Field(..., description="이메일 형식")
    first_name: str = Field(..., description="영문만 허용 (a-z)")
    last_name: str = Field("", description="빈 문자열 허용")
    mobile_no: int = Field(..., description="숫자만 허용")

    @field_validator("username")
    @classmethod
    def username_alphanumeric_lower(cls, v: str) -> str:
        if not re.fullmatch(r"[a-z0-9]+", v):
            raise ValueError("username은 영문 소문자 및 숫자만 허용됩니다.")
        return v

    @field_validator("password")
    @classmethod
    def password_alphanumeric_lower(cls, v: str) -> str:
        if not re.fullmatch(r"[a-z0-9]+", v):
            raise ValueError("password는 영문 소문자 및 숫자만 허용됩니다.")
        return v

    @field_validator("first_name")
    @classmethod
    def first_name_alpha_only(cls, v: str) -> str:
        if v and not re.fullmatch(r"[A-Za-z]+", v):
            raise ValueError("first_name은 영문만 허용됩니다.")
        return v


class CreateAccountData(BaseModel):
    """createaccount 성공 시 data 페이로드."""
    user_id: str
    username: str
    usercode: str
    currency: str
    token: str


class CreateAccountResponse(CasinoBaseResponse):
    """createaccount 응답 — data 타입 구체화."""
    data: Optional[CreateAccountData] = None


# ---------------------------------------------------------------------------
# /addmemberpoint — 머니 충전 (에이전트 → 유저)
# ---------------------------------------------------------------------------

class AddMemberPointRequest(BaseModel):
    """
    유저 포인트 충전 요청.

    usercode           : 유저의 유저코드 (createaccount 응답의 usercode)
    transaction_amount : 유저 지갑으로 이전될 금액 (String)
    ext_transaction_id : 참조용 무작위 생성 16자리 트랜잭션 ID (Optional)
    """
    usercode: str = Field(..., description="유저의 유저코드")
    transaction_amount: str = Field(..., description="충전 금액 (String)")
    ext_transaction_id: Optional[str] = Field(
        None, description="16자리 외부 트랜잭션 ID (중복 방지용, 선택)"
    )


# ---------------------------------------------------------------------------
# /subtractmemberpoint — 머니 차감 (유저 → 에이전트)
# ---------------------------------------------------------------------------

class SubtractMemberPointRequest(BaseModel):
    """
    유저 포인트 출금/차감 요청.

    usercode           : 유저의 유저코드
    transaction_amount : 유저 지갑에서 출금/차감될 금액 (String)
    ext_transaction_id : 참조용 무작위 생성 16자리 트랜잭션 ID (Optional)
    """
    usercode: str = Field(..., description="유저의 유저코드")
    transaction_amount: str = Field(..., description="차감 금액 (String)")
    ext_transaction_id: Optional[str] = Field(
        None, description="16자리 외부 트랜잭션 ID (중복 방지용, 선택)"
    )


# ---------------------------------------------------------------------------
# /getaccountbalance — 잔액 조회
# ---------------------------------------------------------------------------

class GetAccountBalanceRequest(BaseModel):
    """
    계정 잔고 조회 요청.

    usercode : 유저의 유저코드
    token    : 게임 플레이 중 세션 식별을 위한 자동 생성 토큰
    """
    usercode: str = Field(..., description="유저의 유저코드")
    token: str = Field(..., description="세션 식별 토큰 (createaccount/login 응답의 token)")


class GetAccountBalanceData(BaseModel):
    """getaccountbalance 성공 시 data 페이로드."""
    available_balance: str
    ext_balance: Optional[str] = None


class GetAccountBalanceResponse(CasinoBaseResponse):
    data: Optional[GetAccountBalanceData] = None


# ---------------------------------------------------------------------------
# /getGameUrl — 게임 실행 URL 발급
# ---------------------------------------------------------------------------

class GetGameUrlRequest(BaseModel):
    """
    라이브 게임 URL 요청.

    usercode   : 유저의 유저코드
    mode       : 항상 "real" (LIVE 게임)
    game       : 게임의 고유 ID
    lang       : 언어 코드 (KO/EN/JP/TH/VN/CN/ID/HI/ML 등)
    token      : 세션 식별 토큰
    return_url : LC 게임 홈 아이콘 클릭 시 이동할 URL
    """
    usercode: str = Field(..., description="유저의 유저코드")
    mode: Literal["real"] = Field("real", description="항상 'real'")
    game: str = Field(..., description="게임의 고유 ID")
    lang: str = Field("KO", description="언어 코드 (KO, EN, JP, TH, ...)")
    token: str = Field(..., description="세션 식별 토큰")
    return_url: str = Field(..., description="게임 종료 후 복귀 URL")


class GetGameUrlData(BaseModel):
    """getGameUrl 성공 시 data 페이로드."""
    game_url: Optional[str] = None
    url: Optional[str] = None  # API 버전에 따라 필드명 다를 수 있음


class GetGameUrlResponse(CasinoBaseResponse):
    data: Optional[GetGameUrlData] = None


# ---------------------------------------------------------------------------
# Callback 수신 모델 (Plxmed → 우리 서버)
# ---------------------------------------------------------------------------

class CallbackDataItem(BaseModel):
    """콜백 data 배열 내 개별 베팅 세부정보."""

    model_config = ConfigDict(extra="ignore")

    ext_transaction_id: Optional[str] = Field(None, description="게임사 측 고유 거래 ID")
    transaction_id: Optional[str] = Field(None, description="베팅/당첨/환불 고유 거래 ID")
    round_id: Optional[str] = Field(None, description="게임 라운드 고유 ID")
    user_id: Optional[str] = Field(None, description="플렉스미디어 지갑 보관 사용자 ID")
    usercode: Optional[str] = Field(None, description="사용자 고유 코드")
    username: Optional[str] = Field(None, description="유저 고유 이름")
    provider_id: Optional[str] = Field(None, description="공급자 고유 ID")
    provider_name: Optional[str] = Field(None, description="게임사 이름")
    game_id: Optional[Union[str, int]] = Field(None, description="게임사 게임 목록 ID")
    game_code: Optional[str] = Field(None, description="공급자 고유 게임 ID")
    transaction_type: Optional[str] = Field(
        None, description="트랜잭션 유형: BET / WIN / DEP / WITH"
    )
    transaction_purpose: Optional[str] = Field(
        None, description="실행 단계: DEBIT / CREDIT / ROLLBACK / ROLLIN / ROLLOUT / ENDROUND"
    )
    previous_balance: Optional[str] = Field(None, description="충전전 이전 잔고")
    # Plxmed/에볼 등은 문자열·소수로 보낼 수 있음 — int 고정이면 422
    transaction_amount: Optional[float] = Field(None, description="트랜잭션 금액")
    available_balance: Optional[str] = Field(None, description="충전 이후의 실제 잔액")
    created_date: Optional[str] = Field(None, description="거래 생성 날짜")
    game_details: Optional[Any] = Field(None, description="전체 게임 세부정보")
    seq_transaction_id: Optional[str] = Field(None, description="게임사 고유 시퀀스 트랜잭션 ID")

    @field_validator("transaction_amount", mode="before")
    @classmethod
    def _coerce_transaction_amount(cls, v: Any) -> Any:
        if v is None or v == "":
            return None
        if isinstance(v, bool):
            return float(int(v))
        if isinstance(v, (int, float)):
            return float(v)
        try:
            return float(str(v).replace(",", "").strip())
        except (TypeError, ValueError):
            return None

    @field_validator("game_id", mode="before")
    @classmethod
    def _coerce_game_id(cls, v: Any) -> Any:
        if v is None:
            return None
        if isinstance(v, int):
            return str(v)
        return v


class CasinoCallbackRequest(BaseModel):
    """
    Plxmed 서버가 게임 결과를 POST로 전송하는 콜백 페이로드.

    우리 서버는 처리 후 반드시 {"res_status": "success", "res_message": "success"} 를 반환해야 함.
    """
    model_config = ConfigDict(extra="allow")

    usercode: Optional[str] = Field(None, description="사용자 고유 코드 (상위 또는 data 행에 있을 수 있음)")
    available_balance: Optional[str] = Field(None, description="유저의 현재 잔고")
    time: Optional[str] = Field(None, description="트랜잭션 날짜와 시간")
    data: Optional[list[CallbackDataItem]] = Field(None, description="베팅 세부정보 배열")
    hash: Optional[str] = Field(None, description="MD5 서명 (페이로드+SECURITY_KEY)")

    @field_validator("data", mode="before")
    @classmethod
    def _normalize_data_list(cls, v: Any) -> Any:
        """일부 버전은 data 를 객체 한 건만 보냄 → 리스트로 통일."""
        if v is None:
            return None
        if isinstance(v, dict):
            return [v]
        return v


class CasinoCallbackResponse(BaseModel):
    """콜백 수신 후 Plxmed에 반환해야 하는 응답 형식."""
    res_status: Literal["success"] = "success"
    res_message: Literal["success"] = "success"
