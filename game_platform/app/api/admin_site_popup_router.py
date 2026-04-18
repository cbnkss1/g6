"""사이트 레이어 팝업 CRUD (플레이어 웹 공개 API와 연동)."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants import DEFAULT_SITE_ID, USER_ROLE_SUPER_ADMIN
from app.core.database import get_db
from app.dependencies.auth_jwt import require_admin_user
from app.models.site_config import SiteConfig
from app.models.site_popup import SitePopup
from app.models.user import User

router = APIRouter()


def _strip_html(s: str) -> str:
    t = re.sub(r"<script[^>]*>.*?</script>", "", s, flags=re.I | re.S)
    t = re.sub(r"on\w+\s*=", "data-blocked=", t, flags=re.I)
    return t


def _viewer_site_id(viewer: User) -> UUID:
    return viewer.site_id


def _parse_site_id(db: Session, raw: Optional[str], viewer: User) -> UUID:
    if viewer.role == USER_ROLE_SUPER_ADMIN and raw and raw.strip():
        try:
            sid = UUID(raw.strip())
        except ValueError as e:
            raise HTTPException(status_code=400, detail="site_id 형식 오류") from e
        if db.get(SiteConfig, sid) is None:
            raise HTTPException(status_code=404, detail="사이트를 찾을 수 없습니다.")
        return sid
    return _viewer_site_id(viewer)


class SitePopupCreateBody(BaseModel):
    site_id: Optional[str] = Field(None, description="슈퍼관리자만 다른 테넌트 지정")
    title: str = Field(..., min_length=1, max_length=200)
    body_html: str = Field(..., min_length=1, max_length=100_000)
    device: str = Field("all", pattern="^(all|pc|mobile)$")
    nw_left: int = Field(50, ge=0, le=4000)
    nw_top: int = Field(80, ge=0, le=4000)
    nw_width: int = Field(420, ge=100, le=2000)
    nw_height: int = Field(360, ge=100, le=3000)
    starts_at: datetime
    ends_at: datetime
    is_active: bool = True
    sort_order: int = Field(0, ge=0, le=9999)


class SitePopupPatchBody(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    body_html: Optional[str] = Field(None, max_length=100_000)
    device: Optional[str] = Field(None, pattern="^(all|pc|mobile)$")
    nw_left: Optional[int] = Field(None, ge=0, le=4000)
    nw_top: Optional[int] = Field(None, ge=0, le=4000)
    nw_width: Optional[int] = Field(None, ge=100, le=2000)
    nw_height: Optional[int] = Field(None, ge=100, le=3000)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = Field(None, ge=0, le=9999)


def _row_dict(p: SitePopup) -> Dict[str, Any]:
    return {
        "id": p.id,
        "site_id": str(p.site_id),
        "title": p.title,
        "body_html": p.body_html,
        "device": p.device,
        "nw_left": p.nw_left,
        "nw_top": p.nw_top,
        "nw_width": p.nw_width,
        "nw_height": p.nw_height,
        "starts_at": p.starts_at.isoformat(),
        "ends_at": p.ends_at.isoformat(),
        "is_active": p.is_active,
        "sort_order": p.sort_order,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@router.get("/site-popups", summary="팝업 목록")
def admin_list_site_popups(
    viewer: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
    site_id: Optional[str] = Query(None),
) -> Dict[str, Any]:
    sid = _parse_site_id(db, site_id, viewer)
    rows = list(
        db.scalars(
            select(SitePopup)
            .where(SitePopup.site_id == sid)
            .order_by(SitePopup.sort_order.asc(), SitePopup.id.desc())
        ).all()
    )
    return {"items": [_row_dict(r) for r in rows]}


@router.post("/site-popups", summary="팝업 등록")
def admin_create_site_popup(
    body: SitePopupCreateBody,
    viewer: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    sid = _parse_site_id(db, body.site_id, viewer)
    if body.ends_at <= body.starts_at:
        raise HTTPException(status_code=400, detail="종료 시각은 시작보다 이후여야 합니다.")
    row = SitePopup(
        site_id=sid,
        title=body.title.strip(),
        body_html=_strip_html(body.body_html),
        device=body.device,
        nw_left=body.nw_left,
        nw_top=body.nw_top,
        nw_width=body.nw_width,
        nw_height=body.nw_height,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        is_active=body.is_active,
        sort_order=body.sort_order,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _row_dict(row)


@router.patch("/site-popups/{popup_id}", summary="팝업 수정")
def admin_patch_site_popup(
    popup_id: int,
    body: SitePopupPatchBody,
    viewer: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    row = db.get(SitePopup, popup_id)
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    allowed_site = _viewer_site_id(viewer)
    if viewer.role != USER_ROLE_SUPER_ADMIN and row.site_id != allowed_site:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
    data = body.model_dump(exclude_unset=True)
    if "body_html" in data and data["body_html"] is not None:
        data["body_html"] = _strip_html(data["body_html"])
    for k, v in data.items():
        setattr(row, k, v)
    if "ends_at" in data or "starts_at" in data:
        if row.ends_at <= row.starts_at:
            raise HTTPException(status_code=400, detail="종료 시각은 시작보다 이후여야 합니다.")
    db.commit()
    db.refresh(row)
    return _row_dict(row)


@router.delete("/site-popups/{popup_id}", summary="팝업 삭제")
def admin_delete_site_popup(
    popup_id: int,
    viewer: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    row = db.get(SitePopup, popup_id)
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    allowed_site = _viewer_site_id(viewer)
    if viewer.role != USER_ROLE_SUPER_ADMIN and row.site_id != allowed_site:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
    db.delete(row)
    db.commit()
    return {"ok": True}
