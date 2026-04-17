"""외부 게임사·피드 HTTP 호출 공통 (타임아웃·짧은 재시도·선택 Bearer)."""

from __future__ import annotations

import time
from typing import Any, Dict, Optional, Tuple, Union

import httpx

Jsonish = Union[dict, list]


def timeout_config(
    total_seconds: float,
    connect_seconds: float = 5.0,
) -> httpx.Timeout:
    """read/write 는 total 기준, connect 는 짧게 분리 (hang 방지)."""
    c = min(connect_seconds, total_seconds)
    return httpx.Timeout(total_seconds, connect=c)


def fetch_json_get(
    url: str,
    *,
    total_timeout: float,
    connect_timeout: float = 5.0,
    bearer_token: Optional[str] = None,
    extra_headers: Optional[Dict[str, str]] = None,
    retries: int = 2,
    retry_backoff_sec: float = 0.45,
) -> Tuple[bool, Union[Jsonish, str]]:
    """
    GET → JSON 파싱.
    Returns:
        (True, data) 또는 (False, error_message)
    """
    headers: Dict[str, str] = dict(extra_headers or {})
    t = (bearer_token or "").strip()
    if t:
        headers.setdefault("Authorization", f"Bearer {t}")

    last_err: str = "unknown"
    attempts = max(0, retries) + 1
    for attempt in range(attempts):
        try:
            with httpx.Client(timeout=timeout_config(total_timeout, connect_timeout)) as client:
                resp = client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                if not isinstance(data, (dict, list)):
                    return False, "response json is not object or array"
                return True, data
        except httpx.HTTPStatusError as e:
            last_err = f"http {e.response.status_code}: {e.response.text[:200]!r}"
        except Exception as e:
            last_err = str(e) or type(e).__name__
        if attempt + 1 < attempts:
            time.sleep(retry_backoff_sec * (attempt + 1))
    return False, last_err
