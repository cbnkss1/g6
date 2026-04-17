/**
 * 어드민 REST 호출 — 무응답 시 무한 "불러오는 중…" 방지용 타임아웃.
 * (Next rewrites `/gp-api` → `API_PROXY_TARGET`/8100 이 막혀 있으면 브라우저에서 fetch가 오래 걸릴 수 있음)
 */
import { useAuthStore } from "@/store/useAuthStore";

const DEFAULT_TIMEOUT_MS = 20_000;

/** 로그인 폼용 `POST .../admin/login` 은 401 이어도 세션 무효화·리다이렉트 하지 않음 */
function isAdminLoginPost(url: string, init?: RequestInit): boolean {
  if ((init?.method ?? "GET").toUpperCase() !== "POST") return false;
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const u = url.startsWith("http://") || url.startsWith("https://") ? new URL(url) : new URL(url, base);
    return u.pathname.endsWith("/admin/login");
  } catch {
    return false;
  }
}

export async function adminFetch(
  input: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: outerSignal, ...rest } = init;
  const ctrl = new AbortController();
  const timer = globalThis.setTimeout(() => ctrl.abort(), timeoutMs);

  const onOuterAbort = () => ctrl.abort();
  if (outerSignal) {
    if (outerSignal.aborted) ctrl.abort();
    else outerSignal.addEventListener("abort", onOuterAbort, { once: true });
  }

  try {
    const response = await fetch(input, { ...rest, signal: ctrl.signal });
    if (
      response.status === 401 &&
      typeof window !== "undefined" &&
      !isAdminLoginPost(input, rest)
    ) {
      useAuthStore.getState().clear();
      const path = `${window.location.pathname}${window.location.search}`;
      const qs = new URLSearchParams();
      if (!path.startsWith("/login")) qs.set("next", path);
      qs.set("reason", "session");
      window.location.assign(`/login?${qs.toString()}`);
    }
    return response;
  } catch (err) {
    if (ctrl.signal.aborted) {
      if (outerSignal?.aborted) throw err;
      throw new Error(
        `API 응답 없음(약 ${timeoutMs / 1000}초) — Next 서버의 /gp-api 프록시가 백엔드(기본 127.0.0.1:8100)에 닿는지, ` +
          `uvicorn·API_PROXY_TARGET·방화벽을 확인하세요.`,
      );
    }
    throw err;
  } finally {
    globalThis.clearTimeout(timer);
    outerSignal?.removeEventListener("abort", onOuterAbort);
  }
}
