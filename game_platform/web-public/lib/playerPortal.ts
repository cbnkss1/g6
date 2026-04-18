import { publicApiBase } from "./publicApiBase";

export type PlayerPublicPagesPayload = {
  site_id: string;
  pages: {
    events: string;
    faq: string;
    terms: string;
    domain: string;
    support: string;
    mypage_intro: string;
  };
};

/** 비로그인 시 특정 테넌트 문구를 쓸 때만 설정 (UUID). */
function envDefaultSiteId(): string | null {
  const v = process.env.NEXT_PUBLIC_PLAYER_SITE_ID?.trim();
  return v || null;
}

/**
 * 사이트 정책의 `player_pages` 블록.
 * @param loggedInSiteId 로그인한 플레이어의 `user.site_id` — 멀티 사이트일 때 권장.
 */
export async function fetchPlayerPublicPages(loggedInSiteId?: string | null): Promise<PlayerPublicPagesPayload> {
  const base = publicApiBase();
  const sid = (loggedInSiteId && loggedInSiteId.trim()) || envDefaultSiteId();
  const q = sid ? `?site_id=${encodeURIComponent(sid)}` : "";
  const r = await fetch(`${base}/api/player/public-pages${q}`, { cache: "no-store" });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const detail =
      data && typeof data === "object" && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : r.statusText;
    throw new Error(detail || `요청 실패 (${r.status})`);
  }
  return data as PlayerPublicPagesPayload;
}
