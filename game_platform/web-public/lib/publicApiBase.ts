const TRAIL = /\/$/;

function slotpassPlayerHost(hostname: string): boolean {
  // 플레이어 웹(as.* 등)은 Nginx→Next의 /gp-api 프록시가 정답.
  // 빌드에 박힌 NEXT_PUBLIC_API_URL이 옛 API를 가리키면 로그인만 401 나는 현상 방지.
  return hostname === "as.slotpass.net" || hostname.endsWith(".slotpass.net");
}

/** gp-api 오타(op-api)로 요청해도 rewrite와 동일하게 동작하도록 */
function normalizeApiPrefix(base: string): string {
  if (base === "/op-api") return "/gp-api";
  return base;
}

/**
 * 브라우저에서 호출할 game_platform API 베이스.
 * - 비우면 `/gp-api` → Next rewrites → API_PROXY_TARGET (서버 사이드 프록시, as.slotpass.net 과 API 동일 출처처럼 사용)
 * - 지정하면 브라우저가 해당 URL로 직접 호출 (CORS 필요)
 */
export function publicApiBase(): string {
  if (typeof window !== "undefined" && slotpassPlayerHost(window.location.hostname)) {
    return "/gp-api";
  }
  const v = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!v) return "/gp-api";
  return normalizeApiPrefix(v.replace(TRAIL, ""));
}

/**
 * 플레이어 실시간 알림 WebSocket (`/api/player/ws`).
 * 어드민 `/admin/ws` 와 동일하게 Nginx에서 Upgrade 전달이 필요할 수 있음.
 */
export function publicPlayerWsUrl(): string {
  const win = typeof window !== "undefined" ? window : undefined;
  const host = win?.location.hostname ?? "";

  if (win && slotpassPlayerHost(host)) {
    const api = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (api && /^https?:\/\//i.test(api)) {
      try {
        const u = new URL(api);
        const wss = u.protocol === "https:" ? "wss:" : "ws:";
        return `${wss}//${u.host}/api/player/ws`;
      } catch {
        /* fall through */
      }
    }
    const proto = win.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${win.location.host}/gp-api/api/player/ws`;
  }

  const env = process.env.NEXT_PUBLIC_PLAYER_WS_URL?.trim();
  if (env) return env.replace(TRAIL, "");
  if (win) {
    const proto = win.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${win.location.host}/gp-api/api/player/ws`;
  }
  return "ws://127.0.0.1:8100/api/player/ws";
}
