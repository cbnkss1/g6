"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { SITE_BET_LIMIT_GAMES } from "@/lib/betLimitGames";
import { adminFetch } from "@/lib/adminFetch";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

const GAMES = SITE_BET_LIMIT_GAMES;

type Ov = Record<string, { min_bet?: string; max_bet?: string }>;

export default function MemberBetLimitsPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role ?? "");
  const base = publicApiBase();
  const headers = { Authorization: `Bearer ${token}` };
  const qc = useQueryClient();
  const canPatch = ["super_admin", "owner", "staff"].includes(role);
  const [patch, setPatch] = useState<Record<string, { min_bet?: string; max_bet?: string }>>({});
  const [memberLevel, setMemberLevel] = useState("1");

  const q = useQuery({
    queryKey: ["admin", "user-bet-limits", token ?? "", id],
    queryFn: async () => {
      if (!base || !token) throw new Error("no token");
      const r = await adminFetch(`${base}/admin/users/${id}/bet-limits`, {
        headers,
        cache: "no-store",
      });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as {
        user_id: number;
        login_id: string;
        role: string;
        member_level: number;
        override: Ov;
        site_limits: Ov;
        effective: Ov;
      };
    },
    enabled: Boolean(token && id),
    retry: 0,
  });

  useEffect(() => {
    if (!q.data) return;
    const o: Record<string, { min_bet?: string; max_bet?: string }> = {};
    for (const g of GAMES) {
      const src = q.data.override[g.key];
      if (src) o[g.key] = { ...src };
    }
    setPatch(o);
    setMemberLevel(String(q.data.member_level ?? 1));
  }, [q.data?.user_id, q.data?.override, q.data?.member_level]);

  const levelMut = useMutation({
    mutationFn: async () => {
      if (!base || !token) throw new Error("no token");
      const lvl = Number.parseInt(memberLevel, 10);
      if (Number.isNaN(lvl) || lvl < 1 || lvl > 99) throw new Error("LV 1~99");
      const r = await adminFetch(`${base}/admin/users/${id}/member-level`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ member_level: lvl }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "user-bet-limits", token ?? "", id] });
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      if (!base || !token) throw new Error("no token");
      const r = await adminFetch(`${base}/admin/users/${id}/bet-limits`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: patch }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "user-bet-limits", token ?? "", id] });
    },
  });

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <p className="text-premium-label">회원</p>
        <h1
          className="mt-1 text-2xl font-semibold text-slate-100"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          배팅 한도 (회원별)
        </h1>
        {q.data ? (
          <p className="mt-2 text-sm text-slate-500">
            <span className="font-mono text-slate-300">{q.data.login_id}</span> · 역할 {q.data.role}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-slate-600">
          종목별로 사이트보다 높은 <strong className="text-slate-500">최소</strong>·
          <strong className="text-slate-500">최대</strong>만 설정 가능합니다(최대는 상향만). 비우면 사이트 기본만
          적용됩니다.
        </p>
      </div>

      {q.isError ? <p className="text-sm text-red-400">{(q.error as Error).message}</p> : null}
      {q.isPending && q.isFetching ? (
        <p className="text-sm text-slate-500">불러오는 중… (최대 약 20초)</p>
      ) : null}

      {q.data && (
        <div className="glass-card-sm space-y-4 p-5">
          {q.data.role === "player" && canPatch ? (
            <div className="flex flex-wrap items-end gap-3 border-b border-slate-800/80 pb-4">
              <label className="text-xs text-slate-500">
                회원 레벨 (보너스 % 테이블)
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={memberLevel}
                  onChange={(e) => setMemberLevel(e.target.value)}
                  className="mt-1 block w-24 rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 font-mono text-sm"
                />
              </label>
              <button
                type="button"
                disabled={levelMut.isPending}
                onClick={() => levelMut.mutate()}
                className="rounded-lg bg-slate-700 px-4 py-2 text-xs font-medium text-slate-100 hover:bg-slate-600 disabled:opacity-50"
              >
                {levelMut.isPending ? "저장…" : "레벨 저장"}
              </button>
              {levelMut.isError ? (
                <p className="text-xs text-red-400">{(levelMut.error as Error).message}</p>
              ) : null}
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-2">종목</th>
                  <th className="py-2 pr-2">사이트 최소</th>
                  <th className="py-2 pr-2">사이트 최대</th>
                  <th className="py-2 pr-2">적용 최소</th>
                  <th className="py-2 pr-2">적용 최대</th>
                  <th className="py-2 pr-2">개인 min</th>
                  <th className="py-2">개인 max</th>
                </tr>
              </thead>
              <tbody>
                {GAMES.map(({ key, label }) => {
                  const s = q.data.site_limits[key] ?? {};
                  const e = q.data.effective[key] ?? {};
                  return (
                    <tr key={key} className="border-b border-slate-800/60">
                      <td className="py-2 pr-2 font-medium text-slate-200">{label}</td>
                      <td className="py-2 pr-2 font-mono text-slate-500">{s.min_bet ?? "—"}</td>
                      <td className="py-2 pr-2 font-mono text-slate-500">{s.max_bet ?? "—"}</td>
                      <td className="py-2 pr-2 font-mono text-emerald-300/90">{e.min_bet ?? "—"}</td>
                      <td className="py-2 pr-2 font-mono text-emerald-300/90">{e.max_bet ?? "—"}</td>
                      <td className="py-2 pr-2">
                        <input
                          disabled={!canPatch}
                          value={patch[key]?.min_bet ?? ""}
                          onChange={(ev) =>
                            setPatch((p) => ({
                              ...p,
                              [key]: { ...p[key], min_bet: ev.target.value },
                            }))
                          }
                          placeholder="변경 시만"
                          className="w-full max-w-[120px] rounded border border-slate-800 bg-slate-950/80 px-1 py-1 font-mono disabled:opacity-50"
                        />
                      </td>
                      <td className="py-2">
                        <input
                          disabled={!canPatch}
                          value={patch[key]?.max_bet ?? ""}
                          onChange={(ev) =>
                            setPatch((p) => ({
                              ...p,
                              [key]: { ...p[key], max_bet: ev.target.value },
                            }))
                          }
                          placeholder="상향만"
                          className="w-full max-w-[120px] rounded border border-slate-800 bg-slate-950/80 px-1 py-1 font-mono disabled:opacity-50"
                        />
                      </td>
                    </tr>
                  );
                })}
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
                {mut.isPending ? "저장 중…" : "개인 한도 저장"}
              </button>
              <p className="text-[10px] text-slate-600">
                전부 지우고 저장하면 입력한 종목의 개인 오버라이드가 비워집니다. (사이트 기본으로 복귀)
              </p>
            </div>
          ) : null}
        </div>
      )}

      <Link href="/members" className="text-sm text-slate-500 hover:text-slate-300">
        ← 회원 목록
      </Link>
    </div>
  );
}
