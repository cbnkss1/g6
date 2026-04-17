"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type AuditEntry = {
  id: number;
  actor_login_id: string | null;
  actor_role: string | null;
  actor_ip: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  before_json: string | null;
  after_json: string | null;
  note: string | null;
  created_at: string | null;
};

const ACTION_COLORS: Record<string, string> = {
  LOGIN_OK: "text-emerald-400",
  LOGIN_FAIL: "text-red-400",
  OTP_FAIL: "text-red-400",
  OTP_ENABLED: "text-sky-400",
  OTP_DISABLED: "text-amber-400",
  CASH_APPROVE: "text-emerald-400",
  CASH_REJECT: "text-red-400",
  CASH_CREATE: "text-slate-300",
  MONEY_EDIT: "text-amber-400",
  IP_BLOCK: "text-red-400",
};

function fmtDt(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", {
    year: "2-digit", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function tryPretty(json: string | null): string {
  if (!json) return "";
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

export default function AuditLogPage() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const base = publicApiBase();
  const headers = { Authorization: `Bearer ${token}` };

  const params = new URLSearchParams();
  if (actionFilter) params.set("action", actionFilter);
  if (actorFilter) params.set("actor_login_id", actorFilter);
  params.set("limit", "200");

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-logs", actionFilter, actorFilter],
    queryFn: async () => {
      const r = await fetch(`${base}/admin/audit-logs?${params}`, { headers });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(txt);
      }
      return (await r.json()) as { items: AuditEntry[] };
    },
    enabled: !!token,
    refetchInterval: 30000,
  });

  if (error) {
    return (
      <div className="p-6 text-red-400 text-sm">
        접근 권한 없음 (슈퍼관리자 전용): {String(error)}
      </div>
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-premium-glow tracking-tight">감사 로그</h1>
          <p className="mt-0.5 text-xs text-slate-500">모든 관리자 활동의 불변 기록 (슈퍼관리자 전용)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="액션 (예: LOGIN_OK)"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value.toUpperCase())}
            className="admin-touch-input rounded border border-slate-700 bg-slate-800 px-3 text-xs text-slate-200 placeholder-slate-600"
          />
          <input
            type="text"
            placeholder="관리자 ID"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="admin-touch-input rounded border border-slate-700 bg-slate-800 px-3 text-xs text-slate-200 placeholder-slate-600"
          />
        </div>
      </div>

      {isLoading && (
        <p className="py-10 text-center text-slate-500 text-sm animate-pulse">불러오는 중…</p>
      )}
      {!isLoading && items.length === 0 && (
        <p className="py-10 text-center text-slate-500 text-sm">로그 없음</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/60 text-left text-slate-500">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">시각</th>
              <th className="px-3 py-2">관리자</th>
              <th className="px-3 py-2">IP</th>
              <th className="px-3 py-2">액션</th>
              <th className="px-3 py-2">대상</th>
              <th className="px-3 py-2">메모</th>
              <th className="px-3 py-2">상세</th>
            </tr>
          </thead>
          <tbody>
            {items.map((entry) => (
              <>
                <tr
                  key={entry.id}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-3 py-2 text-slate-600">{entry.id}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-400">{fmtDt(entry.created_at)}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-200">{entry.actor_login_id ?? "-"}</span>
                    {entry.actor_role && (
                      <span className="ml-1 text-slate-600">({entry.actor_role})</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-500">{entry.actor_ip ?? "-"}</td>
                  <td className="px-3 py-2">
                    <span className={`font-semibold ${ACTION_COLORS[entry.action] ?? "text-slate-300"}`}>
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-400">
                    {entry.target_type && (
                      <span>{entry.target_type}#{entry.target_id}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-500 max-w-[150px] truncate">{entry.note ?? ""}</td>
                  <td className="px-3 py-2">
                    {(entry.before_json || entry.after_json) && (
                      <button
                        onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                        className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 hover:border-slate-500 hover:text-slate-200"
                      >
                        {expanded === entry.id ? "접기" : "펼치기"}
                      </button>
                    )}
                  </td>
                </tr>
                {expanded === entry.id && (
                  <tr key={`${entry.id}-detail`} className="bg-slate-900/40">
                    <td colSpan={8} className="px-4 py-3">
                      <div className="grid grid-cols-2 gap-4">
                        {entry.before_json && (
                          <div>
                            <p className="mb-1 text-[10px] text-slate-500">이전</p>
                            <pre className="rounded bg-slate-950 p-2 text-[10px] text-slate-400 overflow-auto max-h-40">
                              {tryPretty(entry.before_json)}
                            </pre>
                          </div>
                        )}
                        {entry.after_json && (
                          <div>
                            <p className="mb-1 text-[10px] text-slate-500">이후</p>
                            <pre className="rounded bg-slate-950 p-2 text-[10px] text-emerald-400 overflow-auto max-h-40">
                              {tryPretty(entry.after_json)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
