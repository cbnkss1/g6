const TRAIL = /\/$/;

export function slotpassSlotHost(hostname: string): boolean {
  // 어드민(test·www 등)·플레이어(as) 모두: 로그인과 동일 출처 `/gp-api` 로만 붙여 JWT 불일치 방지.
  return hostname === "test.slotpass.net" || hostname.endsWith(".slotpass.net");
}

/**
 * 어드민 대시보드 WebSocket (`/admin/ws`).
 *
 * `*.slotpass.net`:
 * - 빌드에 박힌 `NEXT_PUBLIC_WS_URL=ws://127.0.0.1:...` 는 **원격 브라우저에서 쓸 수 없음** → 무시.
 * - 공개 `wss://…`(NEXT_PUBLIC_WS_URL)가 있으면 그대로 사용.
 * - `NEXT_PUBLIC_API_URL` 이 `https://호스트/...` 이면 `wss://호스트/admin/ws` 로 유도 (test-api 전용 서버 등).
 * - 그 외: `wss://현재페이지호스트/gp-api/admin/ws` — **Nginx가 `/gp-api/` 를 uvicorn 으로 직접 넘기고 Upgrade 를 켠 경우**에만 동작.
 *   Next 리라이트만 쓰는 구성에서는 `NEXT_PUBLIC_WS_URL` 또는 절대 `NEXT_PUBLIC_API_URL` 을 꼭 맞추세요.
 *
 * 그 외 호스트: `NEXT_PUBLIC_WS_URL` → 브라우저 출처 `/gp-api/admin/ws` → SSR 기본값.
 */
export function publicAdminWsUrl(): string {
  const win = typeof window !== "undefined" ? window : undefined;
  const host = win?.location.hostname ?? "";

  if (win && slotpassSlotHost(host)) {
    const envWs = process.env.NEXT_PUBLIC_WS_URL?.trim();
    if (envWs && !/127\.0\.0\.1|localhost/i.test(envWs)) {
      return envWs.replace(TRAIL, "");
    }
    const api = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (api && /^https?:\/\//i.test(api)) {
      try {
        const u = new URL(api);
        const wss = u.protocol === "https:" ? "wss:" : "ws:";
        return `${wss}//${u.host}/admin/ws`;
      } catch {
        /* fall through */
      }
    }
    const proto = win.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${win.location.host}/gp-api/admin/ws`;
  }

  const env = process.env.NEXT_PUBLIC_WS_URL?.trim();
  if (env) return env.replace(TRAIL, "");
  if (win) {
    const proto = win.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${win.location.host}/gp-api/admin/ws`;
  }
  return "ws://127.0.0.1:8100/admin/ws";
}

/**
 * 브라우저에서 호출하는 REST API 베이스.
 * - `/gp-api` → Next `rewrites`로 서버 쪽 백엔드로 프록시 (SSH로 프론트만 터널해도 로그인 가능).
 * - `http(s)://호스트:포트` → 브라우저가 해당 주소로 직접 호출 (방화벽·공인 오픈 필요).
 */
export function publicApiBase(): string {
  if (typeof window !== "undefined" && slotpassSlotHost(window.location.hostname)) {
    return "/gp-api";
  }
  const v = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!v) return "/gp-api";
  return v.replace(TRAIL, "");
}
