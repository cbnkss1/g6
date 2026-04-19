
"""메인 페이지 Template Router"""
import json
import os
from typing import Any, Dict, List

from typing_extensions import Annotated
from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from core.database import db_session
from core.template import UserTemplates
from service.newwin_service import NewWinService

router = APIRouter()
templates = UserTemplates()

HERO_CONFIG_PATH = os.path.join("data", "config", "main_hero_section.json")
PORTAL_CARDS_PATH = os.path.join("data", "config", "main_portal_cards.json")


def _load_portal_cards() -> List[Dict[str, Any]]:
    """메인 2열 포털 카드(텍스트·링크만, 썸네일 없음)."""
    defaults: List[Dict[str, Any]] = [
        {
            "tag_ko": "자유 게시판",
            "title_en": "FREE BOARD",
            "icon": "📣",
            "desc": "슬롯·카지노 경험과 노하우를 공유하는 커뮤니티. 운영 공지와 자유로운 소통.",
            "more_url": "/board/free",
            "go_url": "/board/free",
        },
        {
            "tag_ko": "슬롯 후기",
            "title_en": "SLOT REVIEWS",
            "icon": "⭐",
            "desc": "실제 플레이어의 솔직한 후기로 게임 선택에 도움을 드립니다.",
            "more_url": "/board/slot_news",
            "go_url": "/board/slot_news",
        },
        {
            "tag_ko": "이벤트",
            "title_en": "EVENTS",
            "icon": "📌",
            "desc": "출석체크·빅윈 인증 등 다양한 이벤트와 보너스를 확인하세요.",
            "more_url": "/board/no_pay",
            "go_url": "/bbs/attendance",
        },
        {
            "tag_ko": "카지노 정보",
            "title_en": "CASINO GUIDE",
            "icon": "🔮",
            "desc": "바카라·룰렛·블랙잭 등 기본부터 전략까지 한곳에 정리했습니다.",
            "more_url": "/board/casino",
            "go_url": "/board/casino",
        },
        {
            "tag_ko": "세계 뉴스",
            "title_en": "WORLD NEWS",
            "icon": "🌐",
            "desc": "코인·카지노 산업과 글로벌 경제 이슈를 빠르게 스캔합니다.",
            "more_url": "/board/casino_news",
            "go_url": "/board/casino_news",
        },
        {
            "tag_ko": "커뮤니티",
            "title_en": "COMMUNITY",
            "icon": "💬",
            "desc": "질문·답변·정보 교환. 슬롯패스 회원들과 함께합니다.",
            "more_url": "/board/aftrer",
            "go_url": "/board/aftrer",
        },
    ]
    try:
        if os.path.isfile(PORTAL_CARDS_PATH):
            with open(PORTAL_CARDS_PATH, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            if isinstance(loaded, list):
                return [x for x in loaded if isinstance(x, dict)]
            if isinstance(loaded, dict):
                cards = loaded.get("cards")
                if isinstance(cards, list) and cards:
                    return [x for x in cards if isinstance(x, dict)]
    except Exception:
        pass
    return defaults


def _load_hero_section() -> Dict[str, Any]:
    """관리자 메인 폼과 동일 JSON — SlotPass Quantum Operations Grid."""
    defaults: Dict[str, Any] = {
        "kicker": "CYBER OBSIDIAN COMMAND",
        "title": "SlotPass Quantum Operations Grid",
        "subtitle": (
            '<p style="margin:0 0 10px;font-size:15px;color:#fef08a;font-weight:700;">운에 맡기지 마라.</p>'
            '<p style="margin:0;color:#cbd5e1;line-height:1.65;">'
            "카지노·주식·코인을 아우르는 AI 인텔리전스로 실시간 시그널·실행 레이어·통합 피드를 단일 커맨드 그리드에서 운영합니다."
            "</p>"
        ),
        "button_1_text": "시뮬레이션 시작",
        "button_1_link": "/game_lobby",
        "button_2_text": "인텔리전스 검색",
        "button_2_link": "/bbs/search",
        "node_status": "NODE ACTIVE",
        "uptime_text": "Infra Uptime: 99.98%",
        "realtime_text": "Realtime Stream: ON",
        "community_text": "Community Boards: LIVE",
        "card_01_title": "Signal Engine",
        "card_01_desc": "게시판 최신 활동을 POST 시그널로 스트리밍합니다.",
        "card_01_link": "",
        "card_02_title": "Execution Layer",
        "card_02_desc": "고우선순위 인텔 이벤트만 MEDIUM/HIGH/CRITICAL로 필터링합니다.",
        "card_02_link": "",
        "card_03_title": "Intelligence Feed",
        "card_03_desc": "실시간 감시 중 · 피드 동기화 대기",
        "card_03_link": "",
        "terminal_logs": (
            "● ● ● slotpass://ops/realtime-log\n"
            "[EVENT] 4월 이벤트 대기중\n"
            "[RUN] thumbnail wrapping policy / mode=execution-layer\n"
            "[SYNC] section order profile / hero→stats→cards→terminal→grid\n"
            "[LIVE] cyber obsidian theme / accent=neon-cyan"
        ),
    }
    try:
        if os.path.isfile(HERO_CONFIG_PATH):
            with open(HERO_CONFIG_PATH, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                for k, v in loaded.items():
                    if isinstance(v, str):
                        defaults[k] = v
    except Exception:
        pass
    return defaults


@router.get("/",
         response_class=HTMLResponse,
         include_in_schema=False)
async def index(
    request: Request,
    db: db_session,
    newwin_service : Annotated[NewWinService, Depends(NewWinService.async_init)]
):
    """메인 페이지"""
    newwins = newwin_service.get_newwins_except_cookie()

    context = {
        "request": request,
        "newwins": newwins,
        "hero_section": _load_hero_section(),
        "portal_cards": _load_portal_cards(),
    }
    return templates.TemplateResponse("/index.html", context)
