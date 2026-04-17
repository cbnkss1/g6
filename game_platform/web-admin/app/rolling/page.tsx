"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type MeApi = {
  user: { id: number; login_id: string; role: string };
  my_rolling_rates: { game_type: string; rate_percent: string }[];
};

type TreeNode = {
  id: number;
  login_id: string;
  depth: number;
  game_money_balance: string;
  rolling_point_balance: string;
  parent_id: number | null;
};

type RatesApi = {
  user_id: number;
  rates: { game_type: string; rate_percent: string }[];
};

export default function RollingPage() {
  const token = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [targetUserId, setTargetUserId] = useState<number | "">("");
  const [rows, setRows] = useState<{ game_type: string; rate_percent: string }[]>([]);

  const isSuper = authUser?.role === "super_admin";

  const meQ = useQuery({
    queryKey: ["api", "me", token ?? ""],
    queryFn: async () => {
      const base = publicApiBase();
      if (!base || !token) throw new Error("no token");
      const r = await fetch(`${base}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`me ${r.status}`);
      return (await r.json()) as MeApi;
    },
    enabled: Boolean(token),
  });

  const treeQ = useQuery({
    queryKey: ["api", "agents", "tree", token ?? "", authUser?.id ?? "", isSuper],
    queryFn: async () => {
      const base = publicApiBase();
      if (!base || !token) throw new Error("no token");
      const uid = authUser?.id;
      const q =
        isSuper && uid != null ? `?root_id=${encodeURIComponent(String(uid))}` : "";
      const r = await fetch(`${base}/api/agents/tree${q}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`tree ${r.status}`);
      return (await r.json()) as { nodes: TreeNode[]; root_user_id: number };
    },
    enabled: Boolean(token && authUser?.id != null),
  });

  const myCaps = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of meQ.data?.my_rolling_rates ?? []) {
      m.set(r.game_type.toUpperCase(), r.rate_percent);
    }
    return m;
  }, [meQ.data]);

  const downlineOptions = useMemo(() => {
    const root = treeQ.data?.root_user_id;
    return (treeQ.data?.nodes ?? []).filter((n) => n.id !== root);
  }, [treeQ.data]);

  const ratesQ = useQuery({
    queryKey: ["admin", "rolling-rates", targetUserId, token ?? ""],
    queryFn: async () => {
      const base = publicApiBase();
      if (!base || !token || targetUserId === "") throw new Error("no");
      const r = await fetch(
        `${base}/admin/users/${targetUserId}/rolling-rates`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      if (!r.ok) throw new Error(`rates ${r.status}`);
      return (await r.json()) as RatesApi;
    },
    enabled: Boolean(token) && targetUserId !== "",
  });

  useEffect(() => {
    if (ratesQ.data?.rates) {
      setRows(
        ratesQ.data.rates.map((x) => ({
          game_type: x.game_type,
          rate_percent: x.rate_percent,
        })),
      );
    }
  }, [ratesQ.data]);

  const saveM = useMutation({
    mutationFn: async () => {
      const base = publicApiBase();
      if (!base || !token || targetUserId === "") throw new Error("no");
      const r = await fetch(
        `${base}/admin/users/${targetUserId}/rolling-rates`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rates: rows.map((row) => ({
              game_type: row.game_type.trim().toUpperCase().slice(0, 32),
              rate_percent: row.rate_percent,
            })),
          }),
        },
      );
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { detail?: string };
        throw new Error(typeof j?.detail === "string" ? j.detail : `save ${r.status}`);
      }
      return await r.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "rolling-rates", targetUserId] });
      void qc.invalidateQueries({ queryKey: ["api", "me"] });
    },
  });

  function addRow() {
    setRows((prev) => [...prev, { game_type: "", rate_percent: "0" }]);
  }

  function updateRow(i: number, field: "game_type" | "rate_percent", v: string) {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: v };
      return next;
    });
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, j) => j !== i));
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">롤링 요율 (팀·다단계 배분)</h2>
        <p className="mt-1 text-sm text-slate-400">
          본인을 루트로 보는 추천인 네트워크( A→B→C… ) 안의 팀원만 선택할 수 있습니다. 나의 요율을 넘는 값은 저장되지
          않습니다.
        </p>
      </div>

      {meQ.isLoading && <p className="text-sm text-slate-500">내 정보 로드 중…</p>}
      {meQ.data && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            나의 현재 요율 (한도)
          </p>
          {meQ.data.my_rolling_rates.length === 0 ? (
            <p className="mt-2 text-sm text-amber-400/90">
              등록된 나의 요율이 없습니다. 팀원에게 게임별 요율을 줄 수 없습니다(0% 한도).
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-premium-glow">
              {meQ.data.my_rolling_rates.map((r) => (
                <li key={r.game_type}>
                  {r.game_type}: <span className="tabular-nums">{r.rate_percent}%</span>
                </li>
              ))}
            </ul>
          )}
          {isSuper && (
            <p className="mt-2 text-xs text-slate-600">
              슈퍼관리자: 서버에서 팀원 요율 한도 검증을 생략합니다.
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm text-slate-400">요율을 편집할 조직 멤버</label>
        <select
          className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          value={targetUserId === "" ? "" : String(targetUserId)}
          onChange={(e) => {
            const v = e.target.value;
            setTargetUserId(v === "" ? "" : Number.parseInt(v, 10));
          }}
        >
          <option value="">선택…</option>
          {meQ.data?.user && (
            <option value={meQ.data.user.id}>
              본인 ({meQ.data.user.login_id})
            </option>
          )}
          {downlineOptions.map((n) => (
            <option key={n.id} value={n.id}>
              {"—".repeat(Math.max(0, n.depth))} {n.login_id} (depth {n.depth})
            </option>
          ))}
        </select>
      </div>

      {targetUserId !== "" && ratesQ.isLoading && (
        <p className="text-sm text-slate-500">요율 불러오는 중…</p>
      )}
      {targetUserId !== "" && ratesQ.isError && (
        <p className="text-sm text-red-400">요율을 불러오지 못했습니다.</p>
      )}

      {targetUserId !== "" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
              onClick={addRow}
            >
              행 추가
            </button>
            <button
              type="button"
              disabled={saveM.isPending}
              className="rounded-lg bg-premium px-4 py-1.5 text-sm font-medium text-slate-950 hover:opacity-90 disabled:opacity-50"
              onClick={() => saveM.mutate()}
            >
              {saveM.isPending ? "저장 중…" : "저장"}
            </button>
          </div>
          {saveM.isError && (
            <p className="text-sm text-red-400">
              {saveM.error instanceof Error ? saveM.error.message : "저장 실패"}
            </p>
          )}

          <div className="table-scroll rounded-xl border border-slate-800">
            <table className="w-full min-w-[480px] text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-2">게임</th>
                  <th className="p-2">요율 %</th>
                  {!isSuper && <th className="p-2">내 한도</th>}
                  <th className="p-2 w-16" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={isSuper ? 3 : 4} className="p-4 text-center text-slate-500">
                    행 추가로 게임·요율을 입력하세요.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, i) => {
                    const cap = myCaps.get(row.game_type.toUpperCase()) ?? "0";
                    return (
                      <tr key={i} className="border-b border-slate-800/60">
                        <td className="p-2">
                          <input
                            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs"
                            value={row.game_type}
                            onChange={(e) => updateRow(i, "game_type", e.target.value)}
                            placeholder="BACCARAT"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs tabular-nums"
                            value={row.rate_percent}
                            onChange={(e) => updateRow(i, "rate_percent", e.target.value)}
                          />
                        </td>
                        {!isSuper && (
                          <td className="p-2 tabular-nums text-slate-500">{cap}%</td>
                        )}
                        <td className="p-2">
                          <button
                            type="button"
                            className="text-xs text-red-400 hover:underline"
                            onClick={() => removeRow(i)}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
