/** 서버 `GET /api/mock-odds` (GAME_PLATFORM_USE_MOCK_SPORTS_ODDS=true 일 때만 200). */

export type MockSportsMatch = {
  match_id: number;
  league: string;
  home_team: string;
  away_team: string;
  home_logo_url: string;
  away_logo_url: string;
  match_time: string;
  status: string;
  odds_home: number;
  odds_draw: number;
  odds_away: number;
};

export type MockOddsPayload = {
  mock: boolean;
  tick: number;
  updated_at: string;
  matches: MockSportsMatch[];
};

export async function fetchMockSportsOdds(apiBase: string): Promise<MockOddsPayload | null> {
  try {
    const r = await fetch(`${apiBase.replace(/\/$/, "")}/api/mock-odds`, { cache: "no-store" });
    if (r.status === 503) return null;
    if (!r.ok) return null;
    const j = (await r.json()) as MockOddsPayload;
    if (!j?.matches || !Array.isArray(j.matches)) return null;
    return j;
  } catch {
    return null;
  }
}
