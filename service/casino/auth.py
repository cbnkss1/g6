"""
Plxmed Casino API 핵심 인증 모듈.

치명적 함정 2가지를 완벽히 반영:
  1. json.dumps() 공백 제거 → separators=(',', ':')
     Node.js JSON.stringify() 와 동일한 직렬화 → MD5 해시 일치 보장
  2. 요청 헤더에 Authorization + client_id 동시 포함
     (7005 / 5009 에러 방지)
"""
import hashlib
import json
import logging
from typing import Any

import httpx
from core.settings import settings

logger = logging.getLogger(__name__)

PLXMED_BASE_URL: str = "https://bp.plxmed.com/api/v1/plexApi"


# ---------------------------------------------------------------------------
# 핵심 함수 1 — MD5 인증 키 생성
# ---------------------------------------------------------------------------

def generate_casino_auth_key(request_data: dict) -> str:
    """
    Plxmed API Bearer Token 생성.

    Args:
        request_data: API 요청 바디 dict (전송 직전의 실제 데이터여야 함)

    Returns:
        HEX 문자열 MD5 해시 — Authorization: Bearer {값} 으로 사용

    주의:
        반드시 separators=(',', ':') 사용.
        공백이 하나라도 다르면 서버 측 해시와 불일치 → 인증 실패.
    """
    security_key: str = settings.PLXMED_SECURITY_KEY

    # ★ 핵심: 공백 없는 최소 직렬화 (Node.js JSON.stringify 동일 결과)
    serialized: str = json.dumps(request_data, separators=(',', ':'), ensure_ascii=False)

    raw: str = security_key + serialized
    auth_key: str = hashlib.md5(raw.encode('utf-8')).hexdigest()

    logger.debug("[casino-auth] serialized=%s | md5=%s", serialized, auth_key)
    return auth_key


# ---------------------------------------------------------------------------
# 핵심 함수 2 — 표준 헤더 빌더
# ---------------------------------------------------------------------------

def build_casino_headers(request_data: dict) -> dict[str, str]:
    """
    API 요청에 필요한 헤더를 구성한다.

    포함 항목:
      - Authorization: Bearer {MD5 auth key}   (인증)
      - client_id: {CLIENT_ID}                  (7005/5009 에러 방지 필수)
      - Content-Type: application/json
    """
    auth_key = generate_casino_auth_key(request_data)
    return {
        "Authorization": f"Bearer {auth_key}",
        "client_id": settings.PLXMED_CLIENT_ID,
        "Content-Type": "application/json",
    }


# ---------------------------------------------------------------------------
# HTTP 클라이언트 코어 클래스
# ---------------------------------------------------------------------------

class CasinoHttpClient:
    """
    Plxmed Casino API HTTP 클라이언트.

    사용법:
        async with CasinoHttpClient() as client:
            result = await client.post("/createaccount", payload)
    """

    BASE_URL = PLXMED_BASE_URL

    def __init__(self, timeout: float = 10.0) -> None:
        self._timeout = timeout

    async def __aenter__(self) -> "CasinoHttpClient":
        self._client = httpx.AsyncClient(timeout=self._timeout)
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self._client.aclose()

    async def post(self, endpoint: str, payload: dict) -> dict:
        """
        POST 요청을 전송하고 JSON 응답을 반환한다.

        Args:
            endpoint: PLXMED_BASE_URL 이후 경로 (예: "/createaccount")
            payload:  전송할 요청 바디 dict
                      ★ client_id 를 payload 에 포함하면 1004 오류 발생 —
                        client_id 는 헤더(build_casino_headers)에서만 전달됨.

        Returns:
            파싱된 JSON 응답 dict

        Raises:
            CasinoApiError: HTTP 오류 또는 API 레벨 오류 코드 발생 시
        """
        # client_id 가 실수로 payload 에 들어와도 제거 (헤더 전용)
        clean_payload = {k: v for k, v in payload.items() if k != "client_id"}
        url = self.BASE_URL + endpoint
        headers = build_casino_headers(clean_payload)

        logger.info("[casino] POST %s payload=%s", url, clean_payload)

        try:
            response = await self._client.post(url, json=clean_payload, headers=headers)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise CasinoApiError(
                f"HTTP {exc.response.status_code} — {endpoint}"
            ) from exc
        except httpx.RequestError as exc:
            raise CasinoApiError(
                f"네트워크 오류 — {endpoint}: {exc}"
            ) from exc

        data: dict = response.json()

        # API 레벨 에러 코드 처리 (Plxmed 규격: code != 0 이면 실패)
        code = data.get("code", data.get("result_code"))
        if code not in (None, 0, "0", "success", "SUCCESS", True):
            raise CasinoApiError(
                f"API 오류 code={code} — {data.get('message', data.get('msg', ''))}"
            )

        logger.info("[casino] response code=%s", code)
        return data


# ---------------------------------------------------------------------------
# 커스텀 예외
# ---------------------------------------------------------------------------

class CasinoApiError(Exception):
    """Plxmed Casino API 호출 실패 시 발생하는 예외."""
