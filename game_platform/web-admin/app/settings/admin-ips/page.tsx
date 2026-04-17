"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type Row = { id: number; ip_pattern: string; memo: string | null; created_at: string | null };

export default function AdminIpsPage() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role ?? "");
  const base = publicApiBase();
  const headers = { Authorization: `Bearer ${token}` };
  const qc = useQueryClient();
  const canPatch = role === "super_admin" || role === "owner";
  const isSuper = role === "super_admin";
  const [siteId, setSiteId] = useState("");
  const [ipPattern, setIpPattern] = useState("");
  const [memo, setMemo] = useState("");

  const q = useQuery({
    queryKey: ["admin", "site-admin-ips", token ?? "", siteId],
    queryFn: async () => {
      if (!base || !token) throw new Error("no token");
      const p = new URLSearchParams();
      if (isSuper && siteId.trim()) p.set("site_id", siteId.trim());
      const r = await adminFetch(`${base}/admin/site/admin-ips?${p}`, { headers, cache: "no-store" });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as { site_id: string; items: Row[] };
    },
    enabled: Boolean(token),
    retry: 0,
  });

  const addMut = useMutation({
    mutationFn: async () => {
      if (!base || !token) throw new Error("no token");
      const p = new URLSearchParams();
      if (isSuper && siteId.trim()) p.set("site_id", siteId.trim());
      const r = await adminFetch(`${base}/admin/site/admin-ips?${p}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ip_pattern: ipPattern.trim(), memo: memo.trim() || null }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      setIpPattern("");
      setMemo("");
      void qc.invalidateQueries({ queryKey: ["admin", "site-admin-ips"] });
    },
  });

  const delMut = useMutation({
    mutationFn: async (id: number) => {
      if (!base || !token) throw new Error("no token");
      const p = new URLSearchParams();
      if (isSuper && siteId.trim()) p.set("site_id", siteId.trim());
      const r = await adminFetch(`${base}/admin/site/admin-ips/${id}?${p}`, {
        method: "DELETE",
        headers,
      });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "site-admin-ips"] }),
  });

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <p className="text-premium-label">설정</p>
        <h1
          className="mt-1 text-2xl font-semibold text-slate-100"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          어드민 허용 IP
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          행이 <strong className="text-slate-400">하나라도</strong> 있으면 해당 사이트는 등록된 IP에서만 어드민 로그인됩니다.
          비우면 제한 없음. CIDR 예: <code className="text-slate-600">10.0.0.0/24</code>
        </p>
      </div>

      {isSuper ? (
        <label className="block max-w-md text-xs text-slate-500">
          site_id (비우면 기본)
          <input
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 font-mono text-sm text-slate-200"
            placeholder="UUID"
          />
        </label>
      ) : null}

      {q.isError ? <p className="text-sm text-red-400">{(q.error as Error).message}</p> : null}
      {q.isPending && q.isFetching ? (
        <p className="text-sm text-slate-500">불러오는 중… (최대 약 20초)</p>
      ) : null}

      {q.data && (
        <div className="glass-card-sm space-y-4 p-5">
          <p className="text-xs text-slate-500">
            site_id: <span className="font-mono text-slate-300">{q.data.site_id}</span>
          </p>
          {canPatch ? (
            <div className="flex flex-wrap gap-2">
              <input
                value={ipPattern}
                onChange={(e) => setIpPattern(e.target.value)}
                placeholder="IP 또는 CIDR"
                className="min-w-[180px] flex-1 rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-2 font-mono text-sm"
              />
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="메모"
                className="min-w-[120px] flex-1 rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-2 text-sm"
              />
              <button
                type="button"
                disabled={addMut.isPending}
                onClick={() => addMut.mutate()}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                추가
              </button>
            </div>
          ) : null}
          {addMut.isError ? <p className="text-xs text-red-400">{(addMut.error as Error).message}</p> : null}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-2">IP</th>
                  <th className="py-2 pr-2">메모</th>
                  <th className="py-2 pr-2">등록</th>
                  {canPatch ? <th className="py-2"> </th> : null}
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/60">
                    <td className="py-2 pr-2 font-mono text-xs text-amber-200/90">{r.ip_pattern}</td>
                    <td className="py-2 pr-2 text-xs text-slate-500">{r.memo ?? "—"}</td>
                    <td className="py-2 pr-2 text-xs text-slate-600">{r.created_at ?? "—"}</td>
                    {canPatch ? (
                      <td className="py-2">
                        <button
                          type="button"
                          className="text-xs text-red-400 hover:underline"
                          onClick={() => {
                            if (confirm("삭제할까요?")) delMut.mutate(r.id);
                          }}
                        >
                          삭제
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
