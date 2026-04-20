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
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from api.v1.models.casino import (
    AddMemberPointRequest,
    CasinoBaseResponse,
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
from service.casino.auth import (
    CasinoApiError,
    CasinoHttpClient,
    generate_casino_auth_key,
)

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

def _exclude_none_nested(obj: Any) -> Any:
    """Pydantic model_dump(exclude_none=True) 와 유사 — Plxmed 해시 검증용."""
    if obj is None:
        return None
    if isinstance(obj, dict):
        out: Dict[str, Any] = {}
        for k, v in obj.items():
            if v is None:
                continue
            nv = _exclude_none_nested(v)
            if nv is not None:
                out[k] = nv
        return out
    if isinstance(obj, list):
        out_list: List[Any] = []
        for x in obj:
            if x is None:
                continue
            nx = _exclude_none_nested(x)
            if nx is not None:
                out_list.append(nx)
        return out_list
    return obj


def _effective_usercode_raw(raw: Dict[str, Any]) -> str:
    u = str(raw.get("usercode") or "").strip()
    if u:
        return u
    data = raw.get("data")
    if isinstance(data, dict):
        data = [data]
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and item.get("usercode"):
                return str(item["usercode"]).strip()
    return ""


def _callback_body_without_hash(raw: Dict[str, Any]) -> Dict[str, Any]:
    """서명 대상: hash/Hash 키 제거(Plxmed API Security — createaccount 등과 동일 규칙)."""
    return {k: v for k, v in raw.items() if str(k).lower() != "hash"}


def _verify_callback_signature(
    request: Request,
    raw: Dict[str, Any],
) -> bool:
    """
    Plxmed API 보안 문서와 동일: md5(SECURITY_KEY + JSON_BODY), JSON 은 공백 없음.

    - 수신 JSON 을 json.loads 한 dict 는 **키 순서가 원문과 같음**(Python 3.7+).
    - sort_keys=True 로 재직렬화하면 Plxmed 서명과 어긋나므로 사용하지 않음.
    - hash 필드는 서명에서 제외. 동일 값이 Authorization: Bearer 로만 올 수 있음.
    """
    sk = (settings.PLXMED_SECURITY_KEY or "").strip()
    if not sk:
        return False

    base = _callback_body_without_hash(raw)

    def _expected_from_payload(payload: Dict[str, Any]) -> Optional[str]:
        try:
            return generate_casino_auth_key(payload)
        except (TypeError, ValueError):
            return None

    candidates: List[str] = []
    exp = _expected_from_payload(base)
    if exp:
        candidates.append(exp)
    try:
        slim = _exclude_none_nested(base)
        if isinstance(slim, dict) and slim != base:
            e2 = _expected_from_payload(slim)
            if e2:
                candidates.append(e2)
    except (TypeError, ValueError):
        pass
    try:
        ser_ascii = json.dumps(base, separators=(",", ":"), ensure_ascii=True)
        candidates.append(hashlib.md5((sk + ser_ascii).encode("utf-8")).hexdigest())
    except (TypeError, ValueError):
        pass

    h = str(raw.get("hash") or raw.get("Hash") or "").strip()
    hl = h.lower() if h else ""
    if h:
        for c in candidates:
            if hl == c.lower():
                return True

    auth = (request.headers.get("Authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        tok = auth[7:].strip()
        for c in candidates:
            if tok.lower() == c.lower():
                return True

    logger.warning(
        "[casino-callback] 서명 검증 실패 payload_keys=%s has_hash=%s has_bearer=%s",
        list(raw.keys())[:20],
        bool(h),
        bool(auth),
    )
    return False


@router.post(
    "/callback",
    response_model=CasinoCallbackResponse,
    summary="게임 결과 콜백 수신 (Plxmed → 서버)",
    status_code=status.HTTP_200_OK,
)
async def casino_callback(request: Request) -> dict:
    """
    Plxmed 콜백 — 원문 바디를 json.loads 로 파싱해 JSON 키 순서를 유지(해시 재직렬화 일치율 향상).
    """
    try:
        body_bytes = await request.body()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"body read failed: {exc}") from exc
    if not body_bytes:
        raise HTTPException(status_code=400, detail="empty body")
    try:
        raw_body = json.loads(body_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail=f"invalid json: {exc}") from exc
    if not isinstance(raw_body, dict):
        raise HTTPException(status_code=400, detail="JSON object required")

    uc = _effective_usercode_raw(raw_body)
    if not uc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="usercode 없음 (상위 또는 data[])",
        )

    logger.info(
        "[casino-callback] usercode=%s time=%s",
        uc,
        raw_body.get("time"),
    )

    sk = (getattr(settings, "PLXMED_SECURITY_KEY", None) or "").strip()
    skip_verify = bool(getattr(settings, "PLXMED_CALLBACK_SKIP_HASH_VERIFY", False))
    if sk:
        hash_val = str(raw_body.get("hash") or raw_body.get("Hash") or "").strip()
        auth_hdr = (request.headers.get("Authorization") or "").strip()
        has_bearer = auth_hdr.lower().startswith("bearer ")
        ok_sig = _verify_callback_signature(request, raw_body)
        if not ok_sig:
            if skip_verify:
                logger.warning(
                    "[casino-callback] PLXMED_CALLBACK_SKIP_HASH_VERIFY=1 — 서명 불일치 무시 usercode=%s",
                    uc,
                )
            elif not hash_val and not has_bearer:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="콜백 hash 또는 Authorization Bearer 누락",
                )
            else:
                logger.warning("[casino-callback] 서명 불일치 usercode=%s", uc)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="콜백 서명 검증 실패",
                )

    gp_base = (getattr(settings, "GAME_PLATFORM_API_BASE", "") or "").strip().rstrip("/")
    gp_key = (getattr(settings, "GAME_PLATFORM_INTERNAL_API_KEY", "") or "").strip()
    if gp_base and gp_key:
        payload = dict(raw_body)
        payload["usercode"] = uc
        try:
            async with httpx.AsyncClient(timeout=25.0) as http:
                r = await http.post(
                    f"{gp_base}/internal/plxmed-casino-callback",
                    json=payload,
                    headers={"X-Internal-Key": gp_key},
                )
            if r.status_code >= 400:
                logger.error(
                    "[casino-callback] game_platform 동기화 실패 HTTP %s %s",
                    r.status_code,
                    (r.text or "")[:500],
                )
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="game_platform 배팅 동기화 실패",
                )
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("[casino-callback] game_platform 전달 오류")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"game_platform 연결 실패: {exc}",
            ) from exc

    logger.info(
        "[casino-callback] 처리 완료 — usercode=%s gp_sync=%s",
        uc,
        bool(gp_base and gp_key),
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
