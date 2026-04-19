"""
Plxmed Casino API 라우터.

엔드포인트 목록:
  GET  /api/v1/casino/providers        — 게임사 목록 (DB)
  GET  /api/v1/casino/games            — 게임 목록 (DB, 카테고리/프로바이더 필터)
  POST /api/v1/casino/account         — 계정 생성/로그인
  POST /api/v1/casino/charge          — 머니 충전 (addmemberpoint)
  POST /api/v1/casino/withdraw        — 머니 출금 (subtractmemberpoint)
  POST /api/v1/casino/game-url        — 게임 실행 URL 발급
  POST /api/v1/casino/balance         — 잔액 조회
  POST /api/v1/casino/callback        — 게임 결과 콜백 수신 (MD5 검증)
"""
import hashlib
import json
import logging
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from api.v1.models.casino import (
    AddMemberPointRequest,
    CasinoBaseResponse,
    CasinoCallbackRequest,
    CasinoCallbackResponse,
    CreateAccountRequest,
    CreateAccountResponse,
    GetAccountBalanceRequest,
    GetAccountBalanceResponse,
    GetGameUrlRequest,
    GetGameUrlResponse,
    SubtractMemberPointRequest,
)
from core.database import db_connect
from core.settings import settings
from lib.dependency.auth import get_login_member_optional
from core.models import Member
from service.casino.auth import CasinoApiError, CasinoHttpClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/casino")


def get_db():
    db = db_connect.sessionLocal()
    try:
        yield db
    finally:
        db.close()


def _normalize_casino_category_param(category: Optional[str]) -> Optional[str]:
    """DB는 `Live Casino`인데, 클라이언트가 `Live+Casino`를 %2B로내면 리터럴 `+`로 들어와 매칭 실패함."""
    if category is None:
        return None
    c = category.strip()
    if c == "Live+Casino":
        return "Live Casino"
    return c


# ---------------------------------------------------------------------------
# 0. 게임사 목록 (DB)
# ---------------------------------------------------------------------------

@router.get(
    "/providers",
    summary="게임사 목록 조회",
)
async def get_providers(
    category: Optional[str] = Query(None, description="Live Casino 또는 Slots"),
    db: Session = Depends(get_db),
) -> Any:
    """
    DB에 저장된 게임사 목록을 반환한다.
    category 파라미터로 라이브카지노/슬롯 구분 가능.
    """
    from sqlalchemy import text

    category = _normalize_casino_category_param(category)
    if category:
        rows = db.execute(text("""
            SELECT p.id, p.title, p.logo_url, p.sort_order, p.lobby_game_id
            FROM casino_providers p
            WHERE p.is_active = 1
              AND EXISTS (
                SELECT 1 FROM casino_games g
                WHERE g.provider_id = p.id AND g.category = :category AND g.is_active = 1
              )
            ORDER BY p.sort_order, p.title
        """), {"category": category}).fetchall()
    else:
        rows = db.execute(text("""
            SELECT id, title, logo_url, sort_order, lobby_game_id FROM casino_providers
            WHERE is_active = 1 ORDER BY sort_order, title
        """)).fetchall()

    return {
        "status": "0",
        "code": "SUCCESS",
        "data": [
            {"id": r[0], "title": r[1], "logo_url": r[2], "lobby_game_id": r[4]}
            for r in rows
        ]
    }


# ---------------------------------------------------------------------------
# 0-2. 게임 목록 (DB)
# ---------------------------------------------------------------------------

@router.get(
    "/games",
    summary="게임 목록 조회",
)
async def get_games(
    category: Optional[str] = Query(None, description="Live Casino 또는 Slots"),
    provider_id: Optional[int] = Query(None, description="게임사 ID"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> Any:
    """
    DB에 저장된 게임 목록 반환. 카테고리/프로바이더 필터 및 페이징 지원.
    """
    from sqlalchemy import text

    category = _normalize_casino_category_param(category)
    conditions = ["g.is_active = 1"]
    params: dict = {}

    if category:
        conditions.append("g.category = :category")
        params["category"] = category
    if provider_id:
        conditions.append("g.provider_id = :provider_id")
        params["provider_id"] = provider_id

    where = " AND ".join(conditions)
    offset = (page - 1) * limit
    params["limit"] = limit
    params["offset"] = offset

    rows = db.execute(text(f"""
        SELECT g.id, g.provider_id, p.title as provider_name,
               g.game_name, g.game_code, g.game_image,
               g.game_title, g.category, g.is_jackpot, g.is_demo,
               g.plxmed_game_id
        FROM casino_games g
        LEFT JOIN casino_providers p ON p.id = g.provider_id
        WHERE {where}
        ORDER BY g.provider_id, g.id
        LIMIT :limit OFFSET :offset
    """), params).fetchall()

    total = db.execute(text(f"""
        SELECT COUNT(*) FROM casino_games g WHERE {where}
    """), {k: v for k, v in params.items() if k not in ('limit', 'offset')}).scalar()

    return {
        "status": "0",
        "code": "SUCCESS",
        "total": total,
        "page": page,
        "limit": limit,
        "data": [
            {
                "id": r[0],
                "provider_id": r[1],
                "provider_name": r[2],
                "game_name": r[3],
                "game_code": r[4],
                "game_image": r[5],
                "game_title": r[6],
                "category": r[7],
                "is_jackpot": bool(r[8]),
                "is_demo": bool(r[9]),
                "plxmed_game_id": r[10] or 0,
            }
            for r in rows
        ]
    }


# ---------------------------------------------------------------------------
# 내부 헬퍼
# ---------------------------------------------------------------------------

def _http_error(detail: str, status_code: int = 502) -> HTTPException:
    return HTTPException(status_code=status_code, detail=detail)


# ---------------------------------------------------------------------------
# 1. 계정 생성 / 로그인
# ---------------------------------------------------------------------------

@router.post(
    "/account",
    response_model=CreateAccountResponse,
    summary="카지노 계정 생성",
)
async def create_account(body: CreateAccountRequest) -> Any:
    """
    Plxmed `/createaccount` 호출.
    회원이 없으면 신규 생성, 이미 존재하면 로그인 처리.
    """
    payload = body.model_dump(exclude_none=True)
    try:
        async with CasinoHttpClient() as client:
            return await client.post("/createaccount", payload)
    except CasinoApiError as exc:
        raise _http_error(str(exc)) from exc


# ---------------------------------------------------------------------------
# 2. 머니 충전
# ---------------------------------------------------------------------------

@router.post(
    "/charge",
    response_model=CasinoBaseResponse,
    summary="카지노 머니 충전 (addmemberpoint)",
)
async def charge_member_point(body: AddMemberPointRequest) -> Any:
    """
    Plxmed `/addmemberpoint` 호출.
    회원에게 지정된 금액을 충전한다.
    """
    payload = body.model_dump(exclude_none=True)
    try:
        async with CasinoHttpClient() as client:
            return await client.post("/addmemberpoint", payload)
    except CasinoApiError as exc:
        raise _http_error(str(exc)) from exc


# ---------------------------------------------------------------------------
# 3. 머니 차감 / 출금
# ---------------------------------------------------------------------------

@router.post(
    "/withdraw",
    response_model=CasinoBaseResponse,
    summary="카지노 머니 차감/출금 (subtractmemberpoint)",
)
async def subtract_member_point(body: SubtractMemberPointRequest) -> Any:
    """
    Plxmed `/subtractmemberpoint` 호출.
    회원 잔액에서 지정된 금액을 차감한다.
    """
    payload = body.model_dump(exclude_none=True)
    try:
        async with CasinoHttpClient() as client:
            return await client.post("/subtractmemberpoint", payload)
    except CasinoApiError as exc:
        raise _http_error(str(exc)) from exc


# ---------------------------------------------------------------------------
# 4. 게임 실행 URL 발급
# ---------------------------------------------------------------------------

@router.post(
    "/game-url",
    response_model=GetGameUrlResponse,
    summary="게임 실행 URL 발급 (getGameUrl)",
)
async def get_game_url(body: GetGameUrlRequest) -> Any:
    """
    Plxmed `/getGameUrl` 호출.
    iFrame 또는 신규 탭에서 열 수 있는 게임 실행 URL을 반환한다.
    """
    payload = body.model_dump(exclude_none=True)
    try:
        async with CasinoHttpClient() as client:
            return await client.post("/getGameUrl", payload)
    except CasinoApiError as exc:
        raise _http_error(str(exc)) from exc


# ---------------------------------------------------------------------------
# 5. 잔액 조회
# ---------------------------------------------------------------------------

@router.post(
    "/balance",
    response_model=GetAccountBalanceResponse,
    summary="카지노 잔액 조회 (getaccountbalance)",
)
async def get_account_balance(body: GetAccountBalanceRequest) -> Any:
    """
    Plxmed `/getaccountbalance` 호출.
    회원의 현재 카지노 잔액을 반환한다.
    """
    payload = body.model_dump(exclude_none=True)
    try:
        async with CasinoHttpClient() as client:
            return await client.post("/getaccountbalance", payload)
    except CasinoApiError as exc:
        raise _http_error(str(exc)) from exc


# ---------------------------------------------------------------------------
# 6. 게임 결과 콜백 수신 (Webhook)
# ---------------------------------------------------------------------------

def _verify_callback_hash(body: CasinoCallbackRequest) -> bool:
    """
    콜백 페이로드의 MD5 서명을 검증한다.

    검증 방식: generate_casino_auth_key 와 동일 로직
      md5(SECURITY_KEY + json.dumps(payload_without_hash, separators=(',', ':')))
    """
    payload_for_hash = body.model_dump(exclude={"hash"}, exclude_none=True)
    serialized = json.dumps(payload_for_hash, separators=(',', ':'), ensure_ascii=False)
    expected = hashlib.md5(
        (settings.PLXMED_SECURITY_KEY + serialized).encode('utf-8')
    ).hexdigest()
    return expected == body.hash


@router.post(
    "/callback",
    response_model=CasinoCallbackResponse,
    summary="게임 결과 콜백 수신 (Plxmed → 서버)",
    status_code=status.HTTP_200_OK,
)
async def casino_callback(body: CasinoCallbackRequest) -> dict:
    """
    Plxmed 서버가 게임 종료 후 결과를 POST 로 전송하는 Webhook 엔드포인트.

    처리 순서:
      1. MD5 hash 서명 검증
      2. transaction_id 중복 확인 (TODO: DB 조회)
      3. 회원 잔액 업데이트 (TODO: DB 업데이트)
      4. 성공 응답 반환
    """
    logger.info(
        "[casino-callback] usercode=%s time=%s",
        body.usercode, body.time,
    )

    # ① 서명 검증 — 위조 콜백 차단
    if not _verify_callback_hash(body):
        logger.warning(
            "[casino-callback] 해시 불일치 — usercode=%s",
            body.usercode,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="콜백 서명 검증 실패",
        )

    # ② 중복 거래 확인 (구현 예정)
    # existing = await db.get_casino_tx(body.transaction_id)
    # if existing:
    #     return {"result": "already_processed"}

    # ③ 잔액 업데이트 (구현 예정)
    # await db.update_casino_balance(body.mb_id, body.amount)

    logger.info(
        "[casino-callback] 처리 완료 — usercode=%s",
        body.usercode,
    )
    # Plxmed 문서 규정: 반드시 res_status/res_message = "success" 반환
    return CasinoCallbackResponse()


# ---------------------------------------------------------------------------
# 7. 게임 실행 URL 발급 (프론트 전용 — 로그인 유저 자동 계정 생성/토큰 발급)
# ---------------------------------------------------------------------------

from pydantic import BaseModel as _PydanticBase

class LaunchGameRequest(_PydanticBase):
    game_code: str
    lang: str = "KO"
    return_url: str = "/"


@router.post("/launch", summary="게임 실행 URL 발급 (로그인 전용)")
async def launch_game(
    body: LaunchGameRequest,
    request: Request,
    member: Optional[Member] = Depends(get_login_member_optional),
) -> Any:
    """
    로그인한 유저의 카지노 계정을 자동 생성/로그인하고 게임 URL을 반환한다.
    - 비로그인: login_required=True 반환
    - 로그인: Plxmed createaccount → getGameUrl 순서로 호출
    """
    if not member:
        return {"login_required": True, "message": "로그인이 필요합니다."}

    mb_id = member.mb_id
    username = f"sp_{mb_id}"
    password = f"sp{mb_id}pw"

    try:
        async with CasinoHttpClient() as client:
            # 1) 계정 생성 또는 로그인 (이미 있으면 토큰 재발급)
            acc = await client.post("/createaccount", {
                "username": username,
                "password": password,
            })
            usercode = acc.get("data", {}).get("usercode", "")
            token = acc.get("data", {}).get("token", "")

            if not usercode or not token:
                raise CasinoApiError("계정 정보를 가져올 수 없습니다.")

            # 2) 게임 URL 발급
            game_resp = await client.post("/getGameUrl", {
                "usercode": usercode,
                "mode": "real",
                "game": body.game_code,
                "lang": body.lang,
                "token": token,
                "return_url": body.return_url,
            })
            url = (game_resp.get("data") or {}).get("game_url") or \
                  (game_resp.get("data") or {}).get("url") or ""

            if not url:
                raise CasinoApiError("게임 URL을 받지 못했습니다.")

            return {"url": url, "usercode": usercode}

    except CasinoApiError as exc:
        logger.warning("[casino-launch] 실패 mb_id=%s err=%s", mb_id, exc)
        return {"login_required": False, "message": str(exc)}
