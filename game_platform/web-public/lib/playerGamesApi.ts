import { publicApiBase } from "./publicApiBase";

const b = () => publicApiBase();

function readErr(r: Response, data: unknown): string {
  if (data && typeof data === "object" && "detail" in data) {
    const d = (data as { detail: unknown }).detail;
    if (typeof d === "string") return d;
  }
  return r.statusText || "요청 실패";
}

/** 파워볼 플레이어 UI — 서버 overview.games 와 동일 형태 */
export type PowerballGameInfo = {
  key: string;
  label: string;
  next_round: number;
  live_iframe_url: string;
};

export type PowerballOverview = {
  balance: string;
  next_round: number;
  min_bet: string;
  /** 1회 최대 스테이크 (사이트·개인 한도 반영) */
  max_bet?: string;
  odds_by_pick: Record<string, string>;
  valid_picks: string[];
  /** Bepick 등 실시간 영상 iframe URL (서버 설정) */
  live_iframe_url?: string;
  game_key: string;
  games: PowerballGameInfo[];
  recent_rounds: Array<{
    game_key?: string;
    round_no: number;
    num: number | null;
    pb: number | null;
    sum: number | null;
    created_at: string | null;
  }>;
};

export async function fetchPowerballOverview(
  token: string,
  gameKey?: string,
  opts?: { recentLimit?: number },
): Promise<PowerballOverview> {
  const q = new URLSearchParams();
  if (gameKey) q.set("game_key", gameKey);
  if (opts?.recentLimit != null && opts.recentLimit >= 10) {
    q.set("recent_limit", String(Math.min(400, Math.floor(opts.recentLimit))));
  }
  const qs = q.toString();
  const r = await fetch(
    `${b()}/api/player/games/powerball/overview${qs ? `?${qs}` : ""}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as PowerballOverview;
}

export async function placePowerballBet(
  token: string,
  pick: string,
  amount: string,
  gameKey: string,
): Promise<{ ok: boolean; bet_id: number }> {
  const r = await fetch(`${b()}/api/player/games/powerball/bets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pick, amount, game_key: gameKey }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as { ok: boolean; bet_id: number };
}

export type PowerballBetRow = {
  id: number;
  game_key: string;
  round_no: number;
  pick: string;
  amount: string;
  odds: string;
  status: string;
  payout: string | null;
  created_at: string | null;
  settled_at: string | null;
};

export async function fetchMyPowerballBets(
  token: string,
  gameKey?: string,
): Promise<{ items: PowerballBetRow[] }> {
  const q = new URLSearchParams({ limit: "30" });
  if (gameKey) q.set("game_key", gameKey);
  const r = await fetch(`${b()}/api/player/games/powerball/my-bets?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as { items: PowerballBetRow[] };
}

export type SportsMatchRow = {
  id: number;
  home_team: string;
  away_team: string;
  league_name: string | null;
  sport_type: string;
  match_at: string | null;
  status: string;
  /** 정산 확정 시 (CLOSED/SETTLED 등) */
  result?: string | null;
  odds: Array<{ outcome: string; odds_value: string }>;
};

/** scope=open 배팅 가능, closed 마감·종료(시간 경과 또는 비-OPEN) */
export async function fetchSportsMatches(
  token: string,
  scope: "open" | "closed" = "open",
): Promise<{ balance: string; items: SportsMatchRow[]; scope?: string }> {
  const q = new URLSearchParams({ limit: "150", scope });
  const r = await fetch(`${b()}/api/player/games/sports/matches?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as { balance: string; items: SportsMatchRow[]; scope?: string };
}

/** @deprecated fetchSportsMatches(..., "open") 사용 */
export async function fetchSportsOpenMatches(
  token: string,
): Promise<{ balance: string; items: SportsMatchRow[] }> {
  return fetchSportsMatches(token, "open");
}

export type GameProviderFlags = { casino: Record<string, boolean>; slot: Record<string, boolean> };

/** `site_policies.game_providers` — 카지노/슬롯 게임사 ON/OFF (어드민 게임사 제한과 동일) */
export async function fetchGameProviderFlags(token: string): Promise<GameProviderFlags> {
  const r = await fetch(`${b()}/api/player/games/provider-flags`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as GameProviderFlags;
}

export type CasinoCatalogProviderRow = {
  id: number;
  title: string;
  logo_url?: string;
  lobby_game_id?: number | null;
  [key: string]: unknown;
};

/** JWT + 사이트 카지노 활성 시. `category`: Live+Casino | Slots 등 업스트림과 동일 */
export async function fetchCasinoCatalogProviders(
  token: string,
  category: string,
  opts?: { signal?: AbortSignal },
): Promise<{ data: CasinoCatalogProviderRow[] }> {
  const q = new URLSearchParams({ category });
  const r = await fetch(`${b()}/api/player/games/casino/providers?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: opts?.signal,
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as { data: CasinoCatalogProviderRow[] };
}

export async function fetchCasinoCatalogGames(
  token: string,
  opts: { provider_id: number; category: string; page: number; limit: number; signal?: AbortSignal },
): Promise<{ data: unknown[]; total?: number; [key: string]: unknown }> {
  const { signal, ...rest } = opts;
  const q = new URLSearchParams({
    provider_id: String(rest.provider_id),
    category: rest.category,
    page: String(rest.page),
    limit: String(rest.limit),
  });
  const r = await fetch(`${b()}/api/player/games/casino/games?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal,
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as { data: unknown[]; total?: number; [key: string]: unknown };
}

export async function placeSportsBet(
  token: string,
  stake: string,
  slips: Array<{ match_id: number; selected_outcome: string; odds_at_bet: string }>,
): Promise<Record<string, unknown>> {
  const r = await fetch(`${b()}/api/player/games/sports/bets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ stake, slips }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as Record<string, unknown>;
}
