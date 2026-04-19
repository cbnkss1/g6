"""비로그인 공개: 사이트 팝업 목록."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants import DEFAULT_SITE_ID
from app.core.database import get_db
from app.models.home_hero_slide import HomeHeroSlide
from app.models.site_config import SiteConfig
from app.models.site_popup import SitePopup

router = APIRouter()


def _parse_site(db: Session, site_id: Optional[str]) -> UUID:
    if site_id and site_id.strip():
        try:
            sid = UUID(site_id.strip())
        except ValueError as e:
            raise HTTPException(status_code=400, detail="site_id 형식 오류") from e
        if db.get(SiteConfig, sid) is None:
            raise HTTPException(status_code=404, detail="사이트를 찾을 수 없습니다.")
        return sid
    return DEFAULT_SITE_ID


@router.get("/site-popups", summary="노출 중인 레이어 팝업 (플레이어 웹)")
def public_list_site_popups(
    db: Session = Depends(get_db),
    site_id: Optional[str] = Query(None),
    device: str = Query("pc", pattern="^(pc|mobile)$"),
) -> Dict[str, Any]:
    sid = _parse_site(db, site_id)
    now = datetime.now(timezone.utc)
    stmt = (
        select(SitePopup)
        .where(
            SitePopup.site_id == sid,
            SitePopup.is_active.is_(True),
            SitePopup.starts_at <= now,
            SitePopup.ends_at >= now,
        )
        .order_by(SitePopup.sort_order.asc(), SitePopup.id.asc())
    )
    rows = list(db.scalars(stmt).all())
    out: List[Dict[str, Any]] = []
    for p in rows:
        if p.device not in ("all", device):
            continue
        out.append(
            {
                "id": p.id,
                "title": p.title,
                "body_html": p.body_html,
                "nw_left": p.nw_left,
                "nw_top": p.nw_top,
                "nw_width": p.nw_width,
                "nw_height": p.nw_height,
            }
        )
    return {"items": out}


@router.get("/hero-slides", summary="메인 LIVE EVENTS 히어로 슬라이드 (플레이어 웹)")
def public_list_hero_slides(
    db: Session = Depends(get_db),
    site_id: Optional[str] = Query(None),
    device: str = Query("pc", pattern="^(pc|mobile)$"),
) -> Dict[str, Any]:
    """이미지·제목·부제 조합. 관리자 `/admin/hero-slides` 에서 설정."""
    sid = _parse_site(db, site_id)
    now = datetime.now(timezone.utc)
    stmt = (
        select(HomeHeroSlide)
        .where(
            HomeHeroSlide.site_id == sid,
            HomeHeroSlide.is_active.is_(True),
            HomeHeroSlide.starts_at <= now,
            HomeHeroSlide.ends_at >= now,
        )
        .order_by(HomeHeroSlide.sort_order.asc(), HomeHeroSlide.id.asc())
    )
    rows = list(db.scalars(stmt).all())
    out: List[Dict[str, Any]] = []
    for p in rows:
        if p.device not in ("all", device):
            continue
        out.append(
            {
                "id": p.id,
                "image_url": p.image_url,
                "title": p.title,
                "subtitle": p.subtitle,
                "link_url": p.link_url,
            }
        )
    return {"items": out}
