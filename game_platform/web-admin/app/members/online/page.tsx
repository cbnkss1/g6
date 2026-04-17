"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type DashboardToday = {
  admin_ws_connections?: number;
  player_online_count?: number;
  player_presence_ttl_sec?: number;
};

type OnlineRow = {
  user_id: number;
  login_id: string;
  display_name: string | null;
  site_id: string;
  client_ip: string;
  last_seen_epoch: number;
  idle_seconds: number;
};

type PlayersOnlineResponse = {
  items: OnlineRow[];
  count: number;
  ttl_sec: number;
};

function formatLastSeen(epoch: number): string {
  try {
    return new Date(epoch * 1000).toLocaleString("ko-KR", {
      dateStyle: "short",
      timeStyle: "medium",
    });
  } catch {
    return "—";
  }
}

export default function MembersOnlinePage() {
  const token = useAuthStore((s) => s.token);
  const base = publicApiBase();

  const dash = useQuery({
    queryKey: ["admin", "dashboard-today", token ?? ""],
    queryFn: async () => {
      if (!base || !token) throw new Error("no token");
      const r = await fetch(`${base}/admin/dashboard/today`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as DashboardToday;
    },
    enabled: Boolean(token),
    refetchInterval: 10_000,
  });

  const online = useQuery({
    queryKey: ["admin", "players-online", token ?? ""],
    queryFn: async () => {
      if (!base || !token) throw new Error("no token");
      const r = await fetch(`${base}/admin/players/online`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as PlayersOnlineResponse;
    },
    enabled: Boolean(token),
    refetchInterval: 10_000,
  });

  const ws = dash.data?.admin_ws_connections ?? "—";
  const playerCount = online.data?.count ?? dash.data?.player_online_count ?? "—";
  const ttlSec = online.data?.ttl_sec ?? dash.data?.player_presence_ttl_sec ?? 180;
  const rows = online.data?.items ?? [];

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <p className="text-premium-label">회원</p>
        <h1
          className="mt-1 text-2xl font-semibold text-slate-100"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          현재 접속자
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          플레이어 사이트에서 로그인한 뒤 API 호출 또는 약 40초마다 보내는 heartbeat가 있으면, 최근{" "}
          <strong className="text-slate-300">{ttlSec}초</strong> 이내 활동을 &quot;접속 중&quot;으로
          집계합니다. (백엔드 단일 프로세스 메모리 기준)
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="glass-card-sm space-y-2 p-5">
          <p className="text-xs text-slate-500">플레이어 접속 중(추정)</p>
          <p className="text-3xl font-semibold tabular-nums text-premium">{playerCount}</p>
          {online.isError ? (
            <p className="text-xs text-red-400">접속자 API를 불러오지 못했습니다.</p>
          ) : null}
        </div>
        <div className="glass-card-sm space-y-2 p-5">
          <p className="text-xs text-slate-500">관리자 대시보드 WebSocket 동시 연결</p>
          <p className="text-3xl font-semibold tabular-nums text-slate-300">{ws}</p>
          {dash.isError ? (
            <p className="text-xs text-red-400">대시보드 API를 불러오지 못했습니다.</p>
          ) : null}
        </div>
      </div>

      <div className="glass-card-sm overflow-hidden">
        <div className="border-b border-slate-700/80 px-5 py-3">
          <p className="text-sm font-medium text-slate-200">접속 중 회원 목록</p>
          <p className="mt-0.5 text-xs text-slate-500">아이디 · 표시명 · IP · 마지막 활동 · 유휴(초)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm text-slate-300">
            <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">로그인 ID</th>
                <th className="px-4 py-2.5 font-medium">표시명</th>
                <th className="px-4 py-2.5 font-medium">사이트</th>
                <th className="px-4 py-2.5 font-medium">IP</th>
                <th className="px-4 py-2.5 font-medium">마지막 활동</th>
                <th className="px-4 py-2.5 font-medium text-right">유휴(초)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    {online.isLoading ? "불러오는 중…" : "표시할 접속 중 회원이 없습니다."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.user_id} className="border-t border-slate-800/80 hover:bg-slate-900/40">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-200">{r.login_id}</td>
                    <td className="px-4 py-2.5">{r.display_name ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{r.site_id}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{r.client_ip || "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">
                      {formatLastSeen(r.last_seen_epoch)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">
                      {r.idle_seconds}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/members"
          className="rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-2 text-slate-300 hover:border-premium/40"
        >
          회원 목록
        </Link>
        <Link
          href="/live"
          className="rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-2 text-slate-300 hover:border-premium/40"
        >
          실시간 스트림 (/live)
        </Link>
        <Link
          href="/betting"
          className="rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-2 text-slate-300 hover:border-premium/40"
        >
          배팅 통합 로그
        </Link>
      </div>
    </div>
  );
}
