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
