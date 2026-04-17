"use client";

import { useEffect } from "react";

/**
 * 운영 빌드에서만 기본 활성(우클릭·일부 단축키 차단).
 * 로컬 개발은 NODE_ENV=development 이면 대부분 비활성.
 *
 * 주의: 브라우저 단 차단은 우회 가능하며, 비밀·권한은 반드시 서버에서 검증해야 함.
 * `NEXT_PUBLIC_ADMIN_HARDENING=0` 으로 강제 끄기 가능.
 */
export function AdminDevToolsHardening() {
  useEffect(() => {
    const hardOff = typeof process !== "undefined" && process.env.NEXT_PUBLIC_ADMIN_HARDENING === "0";
    const isProd = process.env.NODE_ENV === "production";
    if (hardOff || !isProd) return;

    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F12") {
        e.preventDefault();
        return;
      }
      if (e.ctrlKey && e.shiftKey && ["I", "J", "C", "K"].includes(e.key.toUpperCase())) {
        e.preventDefault();
      }
    };

    document.addEventListener("contextmenu", onCtx);
    window.addEventListener("keydown", onKey);

    // 간헐적 anti-debug (과도한 CPU 방지: 2.5초마다, DevTools 힌트일 때만)
    let id: ReturnType<typeof setInterval> | undefined;
    id = setInterval(() => {
      const threshold = 160;
      if (window.outerWidth - window.innerWidth > threshold || window.outerHeight - window.innerHeight > threshold) {
        // eslint-disable-next-line no-debugger
        debugger;
      }
    }, 2500);

    return () => {
      document.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("keydown", onKey);
      if (id) clearInterval(id);
    };
  }, []);

  return null;
}
