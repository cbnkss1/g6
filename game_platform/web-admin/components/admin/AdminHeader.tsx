"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { formatMoneyInt } from "@/lib/formatMoney";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAdminUiStore } from "@/store/useAdminUiStore";
import { useAuthStore } from "@/store/useAuthStore";

export function AdminHeader() {
  const toggleSidebar = useAdminUiStore((s) => s.toggleSidebar);
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);
  const loginId = useAuthStore((s) => s.user?.login_id);
  const role = useAuthStore((s) => s.user?.role);
  const token = useAuthStore((s) => s.token);
  const base = publicApiBase();

  const dash = useQuery({
    queryKey: ["admin", "dashboard", "today", token ?? ""],
    queryFn: async () => {
      if (!base || !token) throw new Error("no token");
      const r = await adminFetch(`${base}/admin/dashboard/today`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`dashboard ${r.status}`);
      return (await r.json()) as Record<string, unknown>;
    },
    enabled: Boolean(token),
    refetchInterval: 20_000,
    staleTime: 8_000,
    retry: 0,
  });

  const roleBadge =
    role === "super_admin"
      ? "SUPER"
      : role === "owner"
        ? "OWNER"
        : role === "staff"
          ? "STAFF"
          : role === "player"
            ? "PARTNER"
            : (role ?? "—").toUpperCase();
  const roleBadgeColor =
    role === "super_admin"
      ? "bg-premium/15 border-premium/40 text-premium"
      : role === "owner"
        ? "bg-blue-500/15 border-blue-500/40 text-blue-300"
        : role === "staff"
          ? "bg-slate-700/50 border-slate-600 text-slate-400"
          : role === "player"
            ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300"
            : "bg-slate-700/50 border-slate-600 text-slate-400";

  const [livePulse, setLivePulse] = useState(false);
  useEffect(() => {
    const onPulse = () => {
      setLivePulse(true);
      window.setTimeout(() => setLivePulse(false), 2200);
    };
    window.addEventListener("admin-live-pulse", onPulse);
    return () => window.removeEventListener("admin-live-pulse", onPulse);
  }, []);

  return (
    <header
      className={`sticky top-0 z-30 flex h-14 items-center gap-3 px-4 backdrop-blur-xl transition-shadow duration-300 ${
        livePulse ? "animate-glow-pulse" : ""
      }`}
      style={{
        background: "rgba(6,11,20,0.85)",
        borderBottom: "1px solid rgba(212,175,55,0.10)",
        boxShadow: livePulse
          ? "0 0 40px rgba(212,175,55,0.35), 0 1px 32px rgba(0,0,0,0.5)"
          : "0 1px 32px rgba(0,0,0,0.5)",
      }}
    >
      {/* 사이드바 토글 */}
      <button
        type="button"
        className="hidden h-8 w-8 items-center justify-center rounded-lg border border-slate-800 text-slate-500 transition-all hover:border-premium/30 hover:text-premium lg:flex"
        onClick={toggleSidebar}
        aria-label="사이드바 접기"
      >
        <span className="text-sm">≡</span>
      </button>

      {/* 타이틀 */}
      <div className="flex items-center gap-2">
        <h1
          className="text-base font-semibold tracking-wide text-slate-200 sm:text-lg"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          실시간 운영 콘솔
        </h1>
        <span className="hidden h-1 w-1 rounded-full bg-emerald-400 sm:block animate-pulse" />
      </div>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {dash.data &&
        (dash.data.viewer_game_money_balance != null || dash.data.viewer_rolling_point_balance != null) ? (
          <div className="mr-1 flex max-w-[min(100%,22rem)] shrink-0 items-center gap-1.5 rounded-xl border border-slate-800/90 bg-slate-950/60 px-2 py-1">
            <div
              className="flex items-baseline gap-1.5 border-r border-slate-800/80 pr-2"
              title="게임머니 (보유)"
            >
              <span className="text-[9px] font-medium uppercase tracking-wide text-amber-400/85">머니</span>
              <span className="font-mono text-xs font-semibold tabular-nums text-amber-100">
                {formatMoneyInt(String(dash.data.viewer_game_money_balance ?? 0))}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 pr-0.5" title="롤링 포인트 = 마일리지">
              <span className="text-[9px] font-medium uppercase tracking-wide text-violet-300/90">포인트</span>
              <span className="font-mono text-xs font-semibold tabular-nums text-violet-100">
                {formatMoneyInt(String(dash.data.viewer_rolling_point_balance ?? 0))}
              </span>
            </div>
          </div>
        ) : null}
        {dash.data ? (
          <div className="flex max-w-[52vw] flex-wrap items-center justify-end gap-1 sm:max-w-none md:gap-1.5">
            <span className="shrink-0 rounded border border-purple-500/30 bg-purple-500/10 px-1 py-0.5 text-[8px] text-purple-200 sm:px-2 sm:text-[10px]">
              충전 {String(dash.data.pending_deposit_requests ?? 0)}
            </span>
            <span className="shrink-0 rounded border border-rose-500/30 bg-rose-500/10 px-1 py-0.5 text-[8px] text-rose-200 sm:px-2 sm:text-[10px]">
              환전 {String(dash.data.pending_withdraw_requests ?? 0)}
            </span>
            <span className="shrink-0 rounded border border-slate-700 bg-slate-900/80 px-1 py-0.5 text-[8px] text-slate-400 sm:px-2 sm:text-[10px]">
              접속 {String(dash.data.player_online_count ?? 0)}
            </span>
          </div>
        ) : null}
        {/* 권한 뱃지 */}
        {loginId && (
          <div className="hidden items-center gap-2 sm:flex">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-widest ${roleBadgeColor}`}>
              {roleBadge}
            </span>
            <span className="text-xs text-slate-500">{loginId}</span>
          </div>
        )}

        {/* 로그아웃 */}
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-800 px-3 text-xs text-slate-400 transition-all hover:border-red-500/30 hover:text-red-400"
          onClick={() => {
            clear();
            router.replace("/login");
          }}
        >
          <span className="text-base leading-none">⏻</span>
          <span className="hidden sm:inline">로그아웃</span>
        </button>
      </div>
    </header>
  );
}
