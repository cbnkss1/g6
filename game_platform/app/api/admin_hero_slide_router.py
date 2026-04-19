"""메인 히어로 슬라이드 CRUD."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants import USER_ROLE_SUPER_ADMIN
from app.core.database import get_db
from app.dependencies.auth_jwt import require_admin_user
from app.models.home_hero_slide import HomeHeroSlide
from app.models.site_config import SiteConfig
from app.models.user import User

router = APIRouter()


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


class HeroSlideCreateBody(BaseModel):
    site_id: Optional[str] = Field(None, description="슈퍼관리자만 다른 테넌트 지정")
    image_url: Optional[str] = Field(None, max_length=8000)
    title: str = Field("", max_length=300)
    subtitle: str = Field("", max_length=2000)
    link_url: Optional[str] = Field(None, max_length=8000)
    device: str = Field("all", pattern="^(all|pc|mobile)$")
    sort_order: int = Field(0, ge=0, le=9999)
    starts_at: datetime
    ends_at: datetime
    is_active: bool = True


class HeroSlidePatchBody(BaseModel):
    image_url: Optional[str] = Field(None, max_length=8000)
    title: Optional[str] = Field(None, max_length=300)
    subtitle: Optional[str] = Field(None, max_length=2000)
    link_url: Optional[str] = Field(None, max_length=8000)
    device: Optional[str] = Field(None, pattern="^(all|pc|mobile)$")
    sort_order: Optional[int] = Field(None, ge=0, le=9999)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    is_active: Optional[bool] = None


def _row_dict(p: HomeHeroSlide) -> Dict[str, Any]:
    return {
        "id": p.id,
        "site_id": str(p.site_id),
        "image_url": p.image_url,
        "title": p.title,
        "subtitle": p.subtitle,
        "link_url": p.link_url,
        "device": p.device,
        "sort_order": p.sort_order,
        "starts_at": p.starts_at.isoformat(),
        "ends_at": p.ends_at.isoformat(),
        "is_active": p.is_active,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _validate_slide_content(image_url: Optional[str], title: str, subtitle: str) -> None:
    img = (image_url or "").strip()
    t = (title or "").strip()
    s = (subtitle or "").strip()
    if not img and not t and not s:
        raise HTTPException(
            status_code=400,
            detail="이미지 URL, 제목, 부제 중 하나 이상을 입력하세요.",
        )


@router.get("/hero-slides", summary="히어로 슬라이드 목록")
def admin_list_hero_slides(
    viewer: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
    site_id: Optional[str] = Query(None),
) -> Dict[str, Any]:
    sid = _parse_site_id(db, site_id, viewer)
    rows = list(
        db.scalars(
            select(HomeHeroSlide)
            .where(HomeHeroSlide.site_id == sid)
            .order_by(HomeHeroSlide.sort_order.asc(), HomeHeroSlide.id.asc())
        ).all()
    )
    return {"items": [_row_dict(r) for r in rows]}


@router.post("/hero-slides", summary="히어로 슬라이드 등록")
def admin_create_hero_slide(
    body: HeroSlideCreateBody,
    viewer: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    sid = _parse_site_id(db, body.site_id, viewer)
    if body.ends_at <= body.starts_at:
        raise HTTPException(status_code=400, detail="종료 시각은 시작보다 이후여야 합니다.")
    _validate_slide_content(body.image_url, body.title, body.subtitle)
    row = HomeHeroSlide(
        site_id=sid,
        image_url=(body.image_url or "").strip() or None,
        title=(body.title or "").strip(),
        subtitle=(body.subtitle or "").strip(),
        link_url=(body.link_url or "").strip() or None,
        device=body.device,
        sort_order=body.sort_order,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        is_active=body.is_active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _row_dict(row)


@router.patch("/hero-slides/{slide_id}", summary="히어로 슬라이드 수정")
def admin_patch_hero_slide(
    slide_id: int,
    body: HeroSlidePatchBody,
    viewer: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    row = db.get(HomeHeroSlide, slide_id)
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    allowed_site = _viewer_site_id(viewer)
    if viewer.role != USER_ROLE_SUPER_ADMIN and row.site_id != allowed_site:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
    data = body.model_dump(exclude_unset=True)
    if "image_url" in data and data["image_url"] is not None:
        data["image_url"] = data["image_url"].strip() or None
    if "link_url" in data and data["link_url"] is not None:
        data["link_url"] = data["link_url"].strip() or None
    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()
    if "subtitle" in data and data["subtitle"] is not None:
        data["subtitle"] = data["subtitle"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    if "ends_at" in data or "starts_at" in data:
        if row.ends_at <= row.starts_at:
            raise HTTPException(status_code=400, detail="종료 시각은 시작보다 이후여야 합니다.")
    _validate_slide_content(row.image_url, row.title, row.subtitle)
    db.commit()
    db.refresh(row)
    return _row_dict(row)


@router.delete("/hero-slides/{slide_id}", summary="히어로 슬라이드 삭제")
def admin_delete_hero_slide(
    slide_id: int,
    viewer: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    row = db.get(HomeHeroSlide, slide_id)
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    allowed_site = _viewer_site_id(viewer)
    if viewer.role != USER_ROLE_SUPER_ADMIN and row.site_id != allowed_site:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
    db.delete(row)
    db.commit()
    return {"ok": True}
