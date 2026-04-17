from decimal import Decimal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """환경변수 접두사: GAME_PLATFORM_ (예: GAME_PLATFORM_DATABASE_URL)."""

    model_config = SettingsConfigDict(
        env_prefix="GAME_PLATFORM_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/game_platform"
    AUTO_CREATE_TABLES: bool = False

    # 레거시(선택). 비우면 JWT만 허용
    ADMIN_API_TOKEN: str = ""

    JWT_SECRET_KEY: str = "change-me-in-production-use-openssl-rand"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # 게임사·내부 정산 콜백용 (헤더 X-Internal-Key)
    INTERNAL_API_KEY: str = ""

    # 파워볼(코인파워볼 등) — v6 tools/game_engine 과 동일 소스 URL/키
    POWERBALL_ENABLED: bool = Field(default=True, description="끄면 poll 이 동작하지 않음")
    POWERBALL_API_URL: str = "http://111.92.246.124:3001/get_result?game=all"
    POWERBALL_GAME_KEY: str = "coinpowerball3"
    POWERBALL_GAME_KEYS: str = Field(
        default="coinpowerball3,coinpowerball5,eospowerball3,eospowerball,pbg",
        description="콤마 구분 종목 키(get_result JSON 최상위 키와 동일). 비우면 POWERBALL_GAME_KEY 한 종목만.",
    )
    POWERBALL_BEARER_TOKEN: str = Field(
        default="",
        description="비어 있지 않으면 Authorization: Bearer 로 전송",
    )
    POWERBALL_ODDS: float = Field(default=1.95, description="당첨 시 지급 배당(스테이크 곱)")
    # 비우면 POWERBALL_GAME_KEY 에 맞는 Bepick 라이브 URL 자동 선택 (v6 game_powerball_live 와 동일)
    POWERBALL_LIVE_IFRAME_URL: str = Field(default="", description="실시간 영상 iframe 전체 URL")
    POWERBALL_MIN_BET: Decimal = Field(default=Decimal("1"))
    POWERBALL_HTTP_TIMEOUT: float = 10.0
    POWERBALL_CONNECT_TIMEOUT: float = 5.0
    POWERBALL_HTTP_RETRIES: int = Field(
        default=5,
        ge=0,
        le=12,
        description="외부 피드 GET 재시도(끊김 완화).",
    )
    POWERBALL_POLL_INTERVAL_SEC: int = Field(
        default=0,
        ge=0,
        le=3600,
        description=">0이면 API 프로세스 안에서 이 간격(초)으로 자동 poll. 0이면 cron·수동 버튼만.",
    )
    POWERBALL_POLL_MAX_ATTEMPTS_PER_TICK: int = Field(
        default=12,
        ge=1,
        le=30,
        description="백그라운드 poll 한 틱당 재시도 횟수(실패·예외 시 지수 대기 후 반복, 끊기지 않음).",
    )
    POWERBALL_POLL_RETRY_DELAY_SEC: float = Field(
        default=1.0,
        ge=0.3,
        le=60.0,
        description="백그라운드 poll 재시도 간 첫 대기(초), 이후 2배씩 상한 30초.",
    )

    # 스포츠/토토 외부 피드 (경기·배당 동기화는 어댑터에서 확장)
    TOTO_ENABLED: bool = Field(default=False, description="토토 외부 API 사용 시 true")
    TOTO_API_BASE_URL: str = Field(
        default="",
        description="베이스 URL (끝 슬래시 없이), 예: https://provider.example.com/api/v1",
    )
    TOTO_BEARER_TOKEN: str = ""
    TOTO_HTTP_TIMEOUT: float = 15.0
    TOTO_CONNECT_TIMEOUT: float = 5.0
    TOTO_PROBE_PATH: str = Field(
        default="/health",
        description="연결 확인용 GET 경로 (베이스에 이어붙임). 없으면 베이스만 요청",
    )
    TOTO_HTTP_RETRIES: int = Field(default=2, ge=0, le=5)

    # The Odds API — https://the-odds-api.com (키는 절대 커밋하지 말 것)
    THE_ODDS_API_KEY: str = ""
    THE_ODDS_API_BASE: str = "https://api.the-odds-api.com"
    THE_ODDS_CACHE_TTL_SEC: int = Field(default=60, ge=5, le=86400, description="동일 응답 캐시 TTL(초)")
    THE_ODDS_REGIONS: str = Field(
        default="uk,eu",
        description="The Odds API regions(콤마). eu만 두면 EPL도 스프레드/토탈 북이 적을 수 있어 uk 포함 권장. 리전 수만큼 쿼터 비용 증가",
    )
    THE_ODDS_BOOKMAKERS: str = Field(
        default="",
        description="비우면 API 기본(여러 부키); 지정 시 해당 부키만 (예: pinnacle)",
    )
    THE_ODDS_HTTP_TIMEOUT: float = 20.0
    THE_ODDS_REQUEST_GAP_SEC: float = Field(
        default=0.2,
        ge=0.0,
        le=2.0,
        description="스포츠별 연속 호출 간 sleep(초)",
    )
    THE_ODDS_MAX_EVENTS_PER_SPORT: int = Field(
        default=55,
        ge=1,
        le=100,
        description="스포츠(리그)당 피드에 넣을 최대 경기 수 — 늘리면 플레이어 동기화 후 노출 경기 수 증가",
    )

    # 관리자에 보여줄 최종 배당 = raw × (1 - margin/100)
    SPORTS_ODDS_MARGIN_PCT: float = Field(default=2.0, ge=0.0, le=50.0)

    # 데모: 외부 Odds API 없이 GET /api/mock-odds + 메모리 배당 틱
    USE_MOCK_SPORTS_ODDS: bool = Field(
        default=False,
        description="True면 백그라운드 시뮬레이터 기동 + 공개 GET /api/mock-odds",
    )
    MOCK_SPORTS_ODDS_TICK_SEC: float = Field(
        default=5.0,
        ge=1.0,
        le=120.0,
        description="모의 배당 갱신 주기(초)",
    )

    # Plxmed 카지노 API
    PLXMED_CLIENT_ID: str = "410"
    PLXMED_SECURITY_KEY: str = ""
    PLXMED_API_BASE: str = "https://api.plxmed.com"

    # (선택) 외부 그누보드 회원 검증 브릿지 — 기본 끔. 플레이어 로그인은 gp_users 전용 권장.
    PLAYER_LOGIN_V6_ENABLED: bool = Field(default=False, description="True일 때만 POST /api/player/login/v6")
    V6_API_BASE: str = "http://127.0.0.1:8000"
    V6_CASINO_CATALOG_BASE: str = Field(
        default="",
        description="카지노·슬롯 provider/games 목록 GET 프록시 업스트림 베이스(끝 슬래시 없음). 비우면 V6_API_BASE",
    )
    V6_INTERNAL_SECRET: str = "slotpass_internal_secret_2024"

    # (선택) API 프로세스 기동 시 gp_users 플레이어 보장 — 비우면 아무 것도 안 함.
    # 예: test:1234 또는 a:1,b:2  (콤마 구분, 비번에 ':' 금지)
    BOOTSTRAP_PLAYERS: str = Field(
        default="",
        description="기동 시 player 계정 upsert (login:password,...). 운영은 필요할 때만 설정.",
    )

    # 브라우저 주소창으로 GET /api/player/login 열 때 → 플레이어 웹으로 리다이렉트 (비우면 한글 안내 HTML)
    PLAYER_WEB_HOME_URL: str = Field(
        default="",
        description="예: https://as.slotpass.net — GET /api/player/login 시 ?openLogin=1 과 함께 이동",
    )


settings = Settings()
