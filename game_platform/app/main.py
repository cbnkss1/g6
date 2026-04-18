"""
game_platform 전용 FastAPI 앱.
실행: cd game_platform && uvicorn app.main:app --reload --port 8100
(v6 / binance_bot 과 포트·DB 분리)
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.admin_player_notify_router import router as admin_player_notify_router
from app.api.admin_router import router as admin_router
from app.api.admin_site_popup_router import router as admin_site_popup_router
from app.api.admin_support_router import router as admin_support_router
from app.api.agent_router import router as agent_router
from app.api.auth_router import router as auth_router
from app.api.internal_router import router as internal_router
from app.api.partner_api_router import router as partner_api_router
from app.api.partner_router import router as partner_mgmt_router
from app.api.mock_odds_router import router as mock_odds_router
from app.api.player_games_router import router as player_games_router
from app.api.player_ledger_router import router as player_ledger_router
from app.api.player_notifications_api import router as player_notifications_router
from app.api.player_router import router as player_router
from app.api.player_support_router import router as player_support_router
from app.api.public_site_router import router as public_site_router
from app.api.powerball_router import router as powerball_router
from app.api.sports_router import router as sports_router
from app.api.toto_router import router as toto_router
from app.core.config import settings
from app.core.database import engine
from app.models import Base
from app.services.mock_sports_odds_simulator import (
    start_mock_odds_background,
    stop_mock_odds_background,
)
from app.services.powerball_background import start_background_poll_if_configured, stop_background_poll
from app.startup_bootstrap import run_bootstrap_players


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.AUTO_CREATE_TABLES:
        Base.metadata.create_all(bind=engine)
    run_bootstrap_players()
    start_background_poll_if_configured()
    await start_mock_odds_background()
    yield
    await stop_mock_odds_background()
    await stop_background_poll()


app = FastAPI(title="game_platform", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://test.slotpass.net",
        "https://test.slotpass.net",
        "http://www.test.slotpass.net",
        "https://www.test.slotpass.net",
        "http://slotpass.net",
        "https://slotpass.net",
        "http://www.slotpass.net",
        "https://www.slotpass.net",
        "http://as.slotpass.net",
        "https://as.slotpass.net",
    ],
    # *.slotpass.net 포함 (as·test·www 등)
    allow_origin_regex=r"https?://([a-zA-Z0-9-]+\.)*slotpass\.net(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/admin", tags=["auth"])
app.include_router(admin_router, prefix="/admin", tags=["admin"])
app.include_router(admin_player_notify_router, prefix="/admin", tags=["admin-notify"])
app.include_router(admin_site_popup_router, prefix="/admin", tags=["admin-popups"])
app.include_router(admin_support_router, prefix="/admin", tags=["admin-support"])
app.include_router(toto_router, prefix="/admin", tags=["admin-features"])
app.include_router(sports_router, prefix="/admin", tags=["sports"])
app.include_router(powerball_router, prefix="/admin", tags=["powerball"])
app.include_router(partner_mgmt_router, prefix="/admin", tags=["partner-mgmt"])
app.include_router(internal_router, prefix="/internal", tags=["internal"])
app.include_router(agent_router, prefix="/api/agent", tags=["agent"])
app.include_router(mock_odds_router, prefix="/api", tags=["mock-odds"])
app.include_router(partner_api_router, prefix="/api", tags=["partner-api"])
app.include_router(public_site_router, prefix="/api/public", tags=["public"])
app.include_router(player_router, prefix="/api/player", tags=["player"])
app.include_router(player_ledger_router, prefix="/api/player", tags=["player-ledger"])
app.include_router(player_notifications_router, prefix="/api/player", tags=["player"])
app.include_router(player_support_router, prefix="/api/player", tags=["player-support"])
app.include_router(player_games_router, prefix="/api/player", tags=["player-games"])


@app.get("/health")
def health():
    return {"status": "ok", "service": "game_platform"}
