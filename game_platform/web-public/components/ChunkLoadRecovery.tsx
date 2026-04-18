"use client";

import { useEffect } from "react";

const STORAGE_KEY = "gp_next_chunk_reload";

/**
 * 배포 직후 HTML과 `/_next/static` 청크 해시가 어긋나면 ChunkLoadError로 페이지가 검은 화면만 보일 수 있음.
 * 한 번만 `location.reload()` 해 캐시/새 HTML을 맞춘다(무한 루프 방지).
 */
export function ChunkLoadRecovery() {
  useEffect(() => {
    const looksLikeChunkFailure = (raw: string) =>
      /ChunkLoadError|Loading chunk \d+ failed|Importing a module script failed|failed to fetch dynamically imported module/i.test(
        raw,
      );

    const maybeReload = (raw: string) => {
      if (!looksLikeChunkFailure(raw)) return;
      const n = Number(sessionStorage.getItem(STORAGE_KEY) || "0");
      if (n >= 1) return;
      sessionStorage.setItem(STORAGE_KEY, "1");
      window.location.reload();
    };

    const onError = (e: ErrorEvent) => {
      const parts = [e.message, e.error?.message, e.filename].filter(Boolean);
      maybeReload(parts.join(" "));
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      const msg =
        r && typeof r === "object" && "message" in r
          ? String((r as Error).message)
          : String(r);
      maybeReload(msg);
    };

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);

    const clear = window.setTimeout(() => {
      sessionStorage.removeItem(STORAGE_KEY);
    }, 8000);

    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
      window.clearTimeout(clear);
    };
  }, []);

  return null;
}
