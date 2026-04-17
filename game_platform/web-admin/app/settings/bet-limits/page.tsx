"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { SITE_BET_LIMIT_GAMES } from "@/lib/betLimitGames";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

const GAMES = SITE_BET_LIMIT_GAMES;

type LimitsMap = Record<string, { min_bet?: string; max_bet?: string }>;

export default function SiteBetLimitsPage() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role ?? "");
  const base = publicApiBase();
  const headers = { Authorization: `Bearer ${token}` };
  const qc = useQueryClient();
  const canPatch = role === "super_admin" || role === "owner";
  const isSuper = role === "super_admin";
  const [siteId, setSiteId] = useState("");
  const [draft, setDraft] = useState<LimitsMap>({});

  const q = useQuery({
    queryKey: ["admin", "site-bet-limits", token ?? "", siteId],
    queryFn: async () => {
      if (!base || !token) throw new Error("no token");
      const p = new URLSearchParams();
      if (isSuper && siteId.trim()) p.set("site_id", siteId.trim());
      const r = await adminFetch(`${base}/admin/site/bet-limits?${p}`, { headers, cache: "no-store" });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as { site_id: string; limits: LimitsMap };
    },
    enabled: Boolean(token),
    retry: 0,
  });

  useEffect(() => {
    if (q.data?.limits) setDraft(JSON.parse(JSON.stringify(q.data.limits)));
  }, [q.data?.limits]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!base || !token) throw new Error("no token");
      const p = new URLSearchParams();
      if (isSuper && siteId.trim()) p.set("site_id", siteId.trim());
      const r = await adminFetch(`${base}/admin/site/bet-limits?${p}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ limits: draft }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "site-bet-limits"] });
    },
  });

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <p className="text-premium-label">설정</p>
        <h1
          className="mt-1 text-2xl font-semibold text-slate-100"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          사이트 배팅 한도 (종목별)
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          파워볼·스포츠·카지노·슬롯 각각 <strong className="text-slate-400">최소·1회 최대</strong>를 설정합니다. 회원별
          상향(최대)은{" "}
          <Link href="/members" className="text-premium hover:underline">
            회원 목록 → 한도
          </Link>
          에서 조정합니다.
        </p>
        <p className="mt-1 text-xs text-slate-600">
          수정: <strong className="text-slate-500">슈퍼관리자</strong> 또는{" "}
          <strong className="text-slate-500">총판(owner)</strong> / 조회: 스태프 포함
        </p>
      </div>

      {isSuper ? (
        <label className="block max-w-md text-xs text-slate-500">
          site_id (다른 테넌트, 비우면 내 기본 사이트)
          <input
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 font-mono text-sm text-slate-200"
            placeholder="UUID"
          />
        </label>
      ) : null}

      {q.isError ? (
        <p className="text-sm text-red-400">{(q.error as Error).message}</p>
      ) : null}

      {q.isPending && q.isFetching ? (
        <p className="text-sm text-slate-500">불러오는 중… (최대 약 20초)</p>
      ) : null}

      {q.data && (
        <div className="glass-card-sm space-y-4 p-5">
          <p className="text-xs text-slate-500">
            site_id: <span className="font-mono text-slate-300">{q.data.site_id}</span>
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">종목</th>
                  <th className="py-2 pr-3">최소 (원)</th>
                  <th className="py-2">1회 최대 (원)</th>
                </tr>
              </thead>
              <tbody>
                {GAMES.map(({ key, label }) => (
                  <tr key={key} className="border-b border-slate-800/60">
                    <td className="py-3 pr-3 font-medium text-slate-200">{label}</td>
                    <td className="py-3 pr-3">
                      <input
                        disabled={!canPatch}
                        value={draft[key]?.min_bet ?? ""}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            [key]: { ...d[key], min_bet: e.target.value },
                          }))
                        }
                        className="w-full max-w-[200px] rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 font-mono text-xs disabled:opacity-50"
                      />
                    </td>
                    <td className="py-3">
                      <input
                        disabled={!canPatch}
                        value={draft[key]?.max_bet ?? ""}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            [key]: { ...d[key], max_bet: e.target.value },
                          }))
                        }
                        className="w-full max-w-[200px] rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 font-mono text-xs disabled:opacity-50"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canPatch ? (
            <div className="space-y-2">
              {mut.isError ? (
                <p className="text-xs text-red-400">{(mut.error as Error).message}</p>
              ) : null}
              <button
                type="button"
                disabled={mut.isPending}
                onClick={() => mut.mutate()}
                className="rounded-xl bg-gradient-to-r from-emerald-500/90 to-green-600 px-6 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
              >
                {mut.isPending ? "저장 중…" : "저장"}
              </button>
            </div>
          ) : (
            <p className="text-xs text-amber-400/90">총판(owner) 또는 슈퍼만 저장할 수 있습니다.</p>
          )}
        </div>
      )}

      <Link href="/settings" className="text-sm text-slate-500 hover:text-slate-300">
        ← 내 정보 / 설정
      </Link>
    </div>
  );
}
