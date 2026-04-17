"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";

export default function TotoPage() {
  const router = useRouter();
  const enabled = useAuthStore((s) => s.site?.is_toto_enabled === true);

  useEffect(() => {
    if (!enabled) router.replace("/");
  }, [enabled, router]);

  if (!enabled) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-100">스포츠 · 토토</h2>
      <p className="text-sm text-slate-400">
        이 사이트는 토토 기능이 활성화되어 있습니다. API 연동은{" "}
        <code className="text-premium">GET /admin/features/toto/summary</code> 를 참고하세요.
      </p>
    </div>
  );
}
