"""Plxmed REST 동기 호출 (서명 헤더 공통)."""
from __future__ import annotations

import hashlib
import json
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


def plxmed_createaccount_usercode_token(login_id: str, email: str | None) -> Tuple[str, str]:
    """회원 login_id 기준 Plxmed 계정 — launch 엔드포인트와 동일 자격증명."""
    username = f"sp_{login_id}"
    password = f"sp{login_id}pw"
    acc_payload = {
        "username": username,
        "password": password,
        "email": email or f"{login_id}@player.local",
        "first_name": login_id,
        "last_name": "",
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
