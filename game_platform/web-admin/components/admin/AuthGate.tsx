"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";

type Props = { children: React.ReactNode };

function previewNoAuthEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_ADMIN_UI_PREVIEW === "1" ||
    process.env.NEXT_PUBLIC_ADMIN_UI_PREVIEW === "true"
  );
}

export function AuthGate({ children }: Props) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [storeReady, setStoreReady] = useState(false);
  const preview = useMemo(() => previewNoAuthEnabled(), []);

  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (!cancelled) setStoreReady(true);
    };
    // onFinishHydration 만 기다리면(이미 복원됨·스토리지 오류 등) 콜백이 안 뜨고 무한 로딩될 수 있음
    const unsub = useAuthStore.persist.onFinishHydration(finish);
    if (useAuthStore.persist.hasHydrated()) {
      finish();
    }
    void Promise.resolve(useAuthStore.persist.rehydrate()).finally(finish);
    const t = window.setTimeout(finish, 2500);
    return () => {
      cancelled = true;
      unsub();
      window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (!storeReady) return;
    if (!token && !preview) {
      const qs = new URLSearchParams();
      const path = `${window.location.pathname}${window.location.search}`;
      if (!path.startsWith("/login")) qs.set("next", path);
      const q = qs.toString();
      router.replace(q ? `/login?${q}` : "/login");
    }
  }, [storeReady, token, preview, router]);

  if (!storeReady) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-premium border-t-transparent" />
        <p className="text-sm text-slate-500">세션 복원 중…</p>
      </div>
    );
  }

  if (!token && !preview) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 px-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-premium border-t-transparent" />
        <p className="text-center text-sm text-slate-500">로그인이 필요합니다. 로그인 화면으로 이동합니다…</p>
      </div>
    );
  }
  return (
    <>
      {preview && !token ? (
        <div
          role="status"
          className="sticky top-0 z-[100] border-b border-amber-500/40 bg-amber-950/90 px-3 py-2 text-center text-xs text-amber-100"
        >
          UI 프리뷰 모드 — 실제 데이터·API는 로그인 후에만 동작합니다. 운영 배포에서는{" "}
          <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_ADMIN_UI_PREVIEW</code> 를 끄세요.
        </div>
      ) : null}
      {children}
    </>
  );
}
