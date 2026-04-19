import { publicApiBase } from "./publicApiBase";

const base = () => publicApiBase();

export type SiteConfigPublic = {
  site_id: string;
  site_name: string;
  is_casino_enabled: boolean;
  is_powerball_enabled: boolean;
  is_toto_enabled: boolean;
};

export type UserPublic = {
  id: number;
  login_id: string;
  display_name: string | null;
  role: string;
  site_id: string;
  is_store_enabled: boolean;
  is_partner: boolean;
  game_money_balance?: string | null;
  rolling_point_balance?: string | null;
};

export type CashRequestPublic = {
  id: number;
  user_id: number;
  request_type: string;
  status: string;
  amount: string;
  memo: string | null;
  required_rolling_amount: string;
  processed_by: number | null;
  processed_at: string | null;
  reject_reason: string | null;
  created_at: string | null;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
  user: UserPublic;
  site: SiteConfigPublic;
};

export type PlayerRegisterResult = LoginResponse & { assigned_login_id?: string | null };

function readErr(r: Response, data: unknown): string {
  if (data && typeof data === "object" && "detail" in data) {
    const d = (data as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      const parts = d
        .map((item) => {
          if (item && typeof item === "object" && "msg" in item) {
            return String((item as { msg: unknown }).msg);
          }
          return JSON.stringify(item);
        })
        .filter(Boolean);
      if (parts.length) return parts.join(" ");
    }
  }
  if (r.status === 401) {
    return "아이디 또는 비밀번호가 일치하지 않습니다.";
  }
  return r.statusText || `요청 실패 (${r.status})`;
}

/** 플랫폼 회원 로그인 (gp_users). 커뮤니티·외부 사이트 계정과 별도입니다. */
export async function playerLogin(login_id: string, password: string): Promise<LoginResponse> {
  return playerLoginNative(login_id, password);
}

export async function playerLoginNative(login_id: string, password: string): Promise<LoginResponse> {
  let r: Response;
  try {
    r = await fetch(`${base()}/api/player/login`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login_id: login_id.trim(), password }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `연결 실패 (${msg}). 같은 주소에서 /gp-api 로 API가 열려 있는지 확인해 주세요.`,
    );
  }
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as LoginResponse;
}

export async function playerRegisterGeneral(
  body: Record<string, unknown>,
): Promise<PlayerRegisterResult> {
  const r = await fetch(`${base()}/api/player/register/general`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as PlayerRegisterResult;
}

export async function playerRegisterAnonymous(
  body: Record<string, unknown>,
): Promise<PlayerRegisterResult> {
  const r = await fetch(`${base()}/api/player/register/anonymous`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as PlayerRegisterResult;
}

/** 관리자「현재 접속자」집계용 — 로그인 유지(40초마다 클라이언트에서 호출 권장). */
export async function playerPresencePing(token: string): Promise<void> {
  const r = await fetch(`${base()}/api/player/presence`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) {
    const data = await r.json().catch(() => null);
    throw new Error(readErr(r, data));
  }
}

export async function playerMe(
  token: string,
  init?: RequestInit,
): Promise<{ user: UserPublic; site: SiteConfigPublic }> {
  const r = await fetch(`${base()}/api/player/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    ...init,
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as { user: UserPublic; site: SiteConfigPublic };
}

export async function playerListCashRequests(
  token: string,
  limit = 30,
): Promise<{ items: CashRequestPublic[] }> {
  const r = await fetch(`${base()}/api/player/cash/requests?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as { items: CashRequestPublic[] };
}

export async function playerCreateCashRequest(
  token: string,
  body: {
    request_type: "DEPOSIT" | "WITHDRAW";
    amount: string;
    memo?: string;
    withdraw_password?: string;
  },
): Promise<CashRequestPublic> {
  const r = await fetch(`${base()}/api/player/cash/requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as CashRequestPublic;
}

export type PlayerNotificationItem = {
  id: number;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string | null;
};

/** 관리자가 보낸 쪽지(알림) 목록 */
export async function playerListNotifications(
  token: string,
  limit = 100,
): Promise<{ items: PlayerNotificationItem[] }> {
  const r = await fetch(`${base()}/api/player/notifications?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as { items: PlayerNotificationItem[] };
}

export async function playerMarkNotificationRead(token: string, notificationId: number): Promise<void> {
  const r = await fetch(`${base()}/api/player/notifications/${notificationId}/read`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
}

export type LedgerEntryPublic = {
  id: number;
  delta: string;
  balance_after: string;
  reason_label: string;
  created_at: string | null;
};

export async function playerListGameMoneyLedger(
  token: string,
  limit = 40,
  offset = 0,
): Promise<{ items: LedgerEntryPublic[] }> {
  const q = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const r = await fetch(`${base()}/api/player/ledger/game-money?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as { items: LedgerEntryPublic[] };
}

export async function playerListRollingLedger(
  token: string,
  limit = 40,
  offset = 0,
): Promise<{ items: LedgerEntryPublic[] }> {
  const q = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const r = await fetch(`${base()}/api/player/ledger/rolling-point?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as { items: LedgerEntryPublic[] };
}

/** 롤링 포인트 → 게임머니 (플레이어 본인) */
export async function playerConvertRollingToGameMoney(
  token: string,
  amount: string,
): Promise<{ ok: boolean; game_money_balance: string; rolling_point_balance: string }> {
  const r = await fetch(`${base()}/api/player/wallet/convert-rolling`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
    cache: "no-store",
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as { ok: boolean; game_money_balance: string; rolling_point_balance: string };
}

export async function playerChangePassword(
  token: string,
  body: { current_password: string; new_password: string },
): Promise<void> {
  const r = await fetch(`${base()}/api/player/password`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
}

export type SupportTicketPublic = {
  id: number;
  category: string;
  title: string;
  body: string;
  attached_bet_ids: number[];
  status: string;
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type SupportBetRow = {
  id: number;
  external_bet_uid: string | null;
  game_type: string;
  bet_amount: string;
  win_amount: string | null;
  status: string;
  game_result: string | null;
  created_at: string | null;
  link_line: string;
};

export async function playerSupportListTickets(
  token: string,
  limit = 40,
): Promise<{ items: SupportTicketPublic[] }> {
  const r = await fetch(`${base()}/api/player/support/tickets?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as { items: SupportTicketPublic[] };
}

export async function playerSupportRecentBets(
  token: string,
  limit = 40,
): Promise<{ items: SupportBetRow[] }> {
  const r = await fetch(`${base()}/api/player/support/bets/recent?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as { items: SupportBetRow[] };
}

export async function playerSupportCreateTicket(
  token: string,
  body: {
    category: string;
    title: string;
    body: string;
    attached_bet_ids?: number[];
  },
): Promise<SupportTicketPublic> {
  const r = await fetch(`${base()}/api/player/support/tickets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      category: body.category,
      title: body.title,
      body: body.body,
      attached_bet_ids: body.attached_bet_ids ?? [],
    }),
    cache: "no-store",
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(readErr(r, data));
  return data as SupportTicketPublic;
}
