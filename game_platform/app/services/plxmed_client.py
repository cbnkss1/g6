"""Plxmed REST 동기 호출 (서명 헤더 공통)."""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Dict, Tuple

import httpx

from app.core.config import settings


def build_plxmed_headers(payload: dict) -> dict:
    serialized = json.dumps(payload, separators=(",", ":"), ensure_ascii=False, sort_keys=False)
    key = (settings.PLXMED_SECURITY_KEY or "").strip()
    if not key:
        raise RuntimeError("PLXMED_SECURITY_KEY is not configured")
    sig = hashlib.md5((key + serialized).encode()).hexdigest()
    return {
        "client_id": str(settings.PLXMED_CLIENT_ID),
        "Authorization": f"Bearer {sig}",
        "Content-Type": "application/json",
    }


def plxmed_post_sync(path: str, payload: dict, *, timeout: float = 25.0) -> dict[str, Any]:
    base = (settings.PLXMED_API_BASE or "").strip().rstrip("/")
    if not base:
        raise RuntimeError("PLXMED_API_BASE is not configured")
    url = f"{base}{path if path.startswith('/') else '/' + path}"
    headers = build_plxmed_headers(payload)
    with httpx.Client(timeout=timeout) as client:
        r = client.post(url, json=payload, headers=headers)
    try:
        return r.json()
    except Exception:
        raise RuntimeError(f"Plxmed non-JSON response HTTP {r.status_code}") from None


def plxmed_local_credentials(login_id: str, user_id: int | None) -> tuple[str, str]:
    """
    Plxmed createaccount 용 username / password.
    문서상 username·password 는 영문 소문자+숫자 위주 — 한글 login_id 를 그대로 쓰면
    비밀번호에 비ASCII가 섞여 토큰은 나와도 getGameUrl 1010 이 날 수 있음.
    비(영소문자+숫자) login_id 는 회원 PK 기반 ASCII 계정으로 고정한다.
    """
    uid = int(user_id) if user_id is not None else 0
    lid = (login_id or "u").strip().lower()
    if re.fullmatch(r"[a-z0-9]+", lid):
        return (f"sp_{lid}", f"sp{lid}pw")
    return (f"sp_uid_{uid}", f"spuid{uid}pw")


def plxmed_success(data: dict) -> bool:
    """createaccount / addmemberpoint 등 공통 성공 판별."""
    if not isinstance(data, dict):
        return False
    # 일부 응답은 code=SUCCESS 만 오고 status 는 생략
    c = str(data.get("code") or "").upper()
    if c in ("SUCCESS", "0", "OK"):
        return True
    if c in ("FAILED", "ERROR", "FAIL"):
        return False
    code = data.get("status") if "status" in data else data.get("code")
    if code in (None, 0, "0", "success", "SUCCESS", True):
        return True
    if str(code).upper() in ("SUCCESS", "0"):
        return True
    return False


def plxmed_createaccount_usercode_token(
    login_id: str,
    email: str | None,
    *,
    user_id: int | None = None,
) -> Tuple[str, str]:
    """회원 login_id 기준 Plxmed 계정 — launch 엔드포인트와 동일 자격증명."""
    username, password = plxmed_local_credentials(login_id, user_id)
    _lid = (login_id or "u").strip()
    _fn = _lid if re.fullmatch(r"[A-Za-z]+", _lid) else (f"u{user_id}" if user_id is not None else "player")
    if user_id is not None:
        mobile_no = 1000000000 + int(user_id)
    else:
        h12 = hashlib.md5(login_id.encode("utf-8")).hexdigest()[:12]
        mobile_no = 1000000000 + (int(h12, 16) % 900000000)
    acc_payload = {
        "username": username,
        "password": password,
        "email": email or f"{login_id}@player.local",
        "first_name": _fn[:64],
        "last_name": "",
        "mobile_no": mobile_no,
    }
    acc_data = plxmed_post_sync("/createaccount", acc_payload)
    if not plxmed_success(acc_data):
        msg = acc_data.get("message", acc_data.get("status", "unknown"))
        raise RuntimeError(f"createaccount failed: {msg}")
    inner = acc_data.get("data") or {}
    usercode = str(inner.get("usercode") or "").strip()
    token = str(inner.get("token") or "").strip()
    if not usercode or not token:
        raise RuntimeError("createaccount: missing usercode/token")
    return usercode, token


def plxmed_get_balance(usercode: str, token: str) -> dict[str, Any]:
    payload = {"usercode": usercode, "token": token}
    return plxmed_post_sync("/getaccountbalance", payload)


def plxmed_add_member_point(
    usercode: str,
    transaction_amount: str,
    ext_transaction_id: str,
) -> dict[str, Any]:
    payload = {
        "usercode": usercode,
        "transaction_amount": transaction_amount,
        "ext_transaction_id": ext_transaction_id,
    }
    return plxmed_post_sync("/addmemberpoint", payload)


def plxmed_subtract_member_point(
    usercode: str,
    transaction_amount: str,
    ext_transaction_id: str,
) -> dict[str, Any]:
    payload = {
        "usercode": usercode,
        "transaction_amount": transaction_amount,
        "ext_transaction_id": ext_transaction_id,
    }
    return plxmed_post_sync("/subtractmemberpoint", payload)
