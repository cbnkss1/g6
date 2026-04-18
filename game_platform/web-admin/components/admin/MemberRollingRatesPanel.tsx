"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { adminFetch } from "@/lib/adminFetch";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type RateRow = {
  game_type: string;
  rolling_rate_percent: string;
  losing_rate_percent: string;
};

type RatesApi = {
  user_id: number;
  rates: RateRow[];
};

/** 정산 엔진 `game_type` — UI에서 카지노는 BACCARAT(또는 레거시 CASINO) */
const PRIMARY_CATEGORIES: { key: string; label: string; note: string }[] = [
  { key: "BACCARAT", label: "라이브 카지노", note: "카지노·라이브 (BACCARAT)" },
  { key: "SLOT", label: "슬롯", note: "슬롯 게임" },
  { key: "POWERBALL", label: "미니게임 · 파워볼", note: "파워볼 등" },
  { key: "SPORTS", label: "스포츠 · 토토", note: "스포츠 배팅" },
];

function normalizeDbKey(gameType: string): string {
  const u = gameType.trim().toUpperCase();
  if (u === "CASINO") return "BACCARAT";
  return u.slice(0, 32);
}

/** API 응답 → 표시 행 (4종 고정 + 그 외 추가 종목) */
function rowsFromApi(rates: RateRow[]): RateRow[] {
  const map = new Map<string, RateRow>();
  for (const r of rates) {
    const k = normalizeDbKey(r.game_type);
    map.set(k, {
      game_type: k,
      rolling_rate_percent: String(r.rolling_rate_percent ?? "0"),
      losing_rate_percent: String(r.losing_rate_percent ?? "0"),
    });
  }
  const primary: RateRow[] = PRIMARY_CATEGORIES.map((p) => {
    const hit = map.get(p.key);
    if (hit) {
      map.delete(p.key);
      return hit;
    }
    return { game_type: p.key, rolling_rate_percent: "0", losing_rate_percent: "0" };
  });
  const extra = Array.from(map.values()).filter(
    (r) => !PRIMARY_CATEGORIES.some((p) => p.key === r.game_type),
  );
  return [...primary, ...extra];
}

/** 회원 상세·한도 화면: 종목별 롤링·루징 요율 조회·저장 */
export function MemberRollingRatesPanel({
  userId,
  variant = "default",
}: {
  userId: number;
  variant?: "default" | "memberDetail";
}) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role ?? "");
  const base = publicApiBase();
  const qc = useQueryClient();
  const isSuper = role === "super_admin";
  const [rows, setRows] = useState<RateRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const cardClass =
    variant === "memberDetail"
      ? "member-rates-card space-y-4 rounded-2xl border border-slate-200/10 bg-gradient-to-br from-slate-800/90 to-slate-900/95 p-6 shadow-lg shadow-black/20"
      : "glass-card-sm space-y-3 p-5";

  const q = useQuery({
    queryKey: ["admin", "rolling-rates", token ?? "", userId],
    queryFn: async () => {
      if (!base || !token || !Number.isFinite(userId) || userId < 1) throw new Error("no token");
      const r = await adminFetch(`${base}/admin/users/${userId}/rolling-rates`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as RatesApi;
    },
    enabled: Boolean(token && Number.isFinite(userId) && userId > 0),
    retry: 0,
    refetchOnWindowFocus: false,
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    setDirty(false);
    setSaveOk(null);
  }, [userId]);

  useEffect(() => {
    if (!q.data?.rates) return;
    if (dirty) return;
    setRows(rowsFromApi(q.data.rates));
  }, [q.data, dirty]);

  function parseApiErrorPayload(j: unknown, fallback: string): string {
    if (!j || typeof j !== "object") return fallback;
    const d = (j as { detail?: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      return d
        .map((e) => {
          if (e && typeof e === "object" && "msg" in e && typeof (e as { msg: unknown }).msg === "string") {
            return (e as { msg: string }).msg;
          }
          return JSON.stringify(e);
        })
        .join(" ");
    }
    return fallback;
  }

  const saveM = useMutation({
    onMutate: () => setSaveOk(null),
    mutationFn: async () => {
      if (!base || !token) throw new Error("no token");
      const dedup: Record<string, RateRow> = {};
      for (const row of rows) {
        const gt = row.game_type.trim().toUpperCase().slice(0, 32);
        if (!gt) continue;
        dedup[gt] = {
          game_type: gt,
          rolling_rate_percent: row.rolling_rate_percent.trim() || "0",
          losing_rate_percent: row.losing_rate_percent.trim() || "0",
        };
      }
      const rates = Object.values(dedup);
      const hasIncompleteRow = rows.some((row) => {
        const r = row.rolling_rate_percent.trim();
        const l = row.losing_rate_percent.trim();
        const hasNums = r !== "" && r !== "0" && r !== "0.0" && r !== "0.00";
        const hasLose = l !== "" && l !== "0" && l !== "0.0" && l !== "0.00";
        return !row.game_type.trim() && (hasNums || hasLose);
      });
      if (rates.length === 0 && rows.length > 0) {
        throw new Error(
          '종목 코드를 입력한 뒤 「요율 저장」을 눌러 주세요. (하단 「변경 저장」만으로는 요율이 저장되지 않습니다.)',
        );
      }
      if (hasIncompleteRow) {
        throw new Error("종목 코드가 비어 있는 행이 있습니다. 종목을 입력하거나 해당 행을 삭제하세요.");
      }
      const r = await adminFetch(`${base}/admin/users/${userId}/rolling-rates`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rates }),
      });
      if (!r.ok) {
        const raw = await r.text();
        const j = (() => {
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })();
        throw new Error(parseApiErrorPayload(j, raw || `HTTP ${r.status}`));
      }
      return r.json() as Promise<{ user_id: number; updated: number }>;
    },
    onSuccess: async (data) => {
      await qc.refetchQueries({
        queryKey: ["admin", "rolling-rates", token ?? "", userId],
        exact: true,
      });
      setDirty(false);
      setSaveOk(`저장 완료 (${data.updated}종목)`);
      void qc.invalidateQueries({ queryKey: ["admin", "rolling-rates"] });
    },
  });

  function addRow() {
    setSaveOk(null);
    setDirty(true);
    setRows((prev) => [...prev, { game_type: "", rolling_rate_percent: "0", losing_rate_percent: "0" }]);
  }

  function updateRow(i: number, field: keyof RateRow, v: string) {
    setSaveOk(null);
    setDirty(true);
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: v };
      return next;
    });
  }

  function removeRow(i: number) {
    setSaveOk(null);
    setDirty(true);
    setRows((prev) => prev.filter((_, j) => j !== i));
  }

  function labelForRow(gameType: string, index: number): string | null {
    const k = gameType.trim().toUpperCase();
    const p = PRIMARY_CATEGORIES.find((x) => x.key === k);
    if (p) return p.label;
    if (index < PRIMARY_CATEGORIES.length) return PRIMARY_CATEGORIES[index]?.label ?? null;
    return null;
  }

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={variant === "memberDetail" ? "text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/90" : "text-premium-label"}>
            게임별 요율 (롤링 · 루징)
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            카지노·슬롯·파워볼·스포츠 종목별 <strong className="text-slate-100">롤링(%)</strong>과 차액 정산용{" "}
            <strong className="text-slate-100">루징(%)</strong>입니다.
            {!isSuper ? (
              <>
                {" "}
                하부에게 줄 수 있는 요율은 <span className="text-amber-200/90">본인 한도</span>를 넘을 수 없습니다.
              </>
            ) : (
              <> 슈퍼관리자는 한도 검증이 완화됩니다.</>
            )}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            반드시 이 블록의 「요율 저장」으로 저장하세요. 상단 「변경 저장」은 프로필만 저장합니다.
          </p>
        </div>
        <Link
          href="/rolling"
          className="shrink-0 rounded-lg border border-slate-500/40 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-200 hover:border-amber-400/40 hover:text-amber-100"
        >
          팀 롤링 화면
        </Link>
      </div>

      {q.isPending ? <p className="text-sm text-slate-400">요율 불러오는 중…</p> : null}
      {q.isError ? <p className="text-sm text-red-400">{(q.error as Error).message}</p> : null}

      {!q.isPending && !q.isError ? (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addRow}
              className="rounded-lg border border-slate-500/50 bg-slate-800/40 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700/50"
            >
              종목 행 추가
            </button>
            <button
              type="button"
              disabled={saveM.isPending}
              onClick={() => {
                void saveM.mutate();
              }}
              className="rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-1.5 text-xs font-semibold text-slate-950 shadow-md hover:opacity-95 disabled:opacity-50"
            >
              {saveM.isPending ? "저장 중…" : "요율 저장"}
            </button>
          </div>
          {saveM.isError ? (
            <p className="text-sm text-red-400">{saveM.error instanceof Error ? saveM.error.message : "저장 실패"}</p>
          ) : null}
          {saveOk && !saveM.isError ? <p className="text-sm text-emerald-400">{saveOk}</p> : null}

          <div className="overflow-x-auto rounded-xl border border-slate-600/30 bg-slate-950/40">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-600/40 bg-slate-900/80 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2.5 font-medium">구분</th>
                  <th className="px-3 py-2.5 font-medium">종목 코드</th>
                  <th className="px-3 py-2.5 font-mono font-medium">롤링 (%)</th>
                  <th className="px-3 py-2.5 font-mono font-medium">루징 (%)</th>
                  <th className="w-12 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const lbl = labelForRow(row.game_type, i);
                  const p = PRIMARY_CATEGORIES.find((x) => x.key === row.game_type.trim().toUpperCase());
                  return (
                    <tr key={`${i}-${row.game_type}`} className="border-b border-slate-700/40 last:border-0">
                      <td className="px-3 py-2 align-top text-xs text-slate-400">
                        {lbl ? (
                          <span>
                            <span className="font-medium text-slate-200">{lbl}</span>
                            {p ? <span className="mt-0.5 block text-[10px] text-slate-500">{p.note}</span> : null}
                          </span>
                        ) : (
                          <span className="text-slate-500">기타</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          value={row.game_type}
                          onChange={(e) => updateRow(i, "game_type", e.target.value)}
                          placeholder="BACCARAT"
                          list={`gp-rolling-hints-${userId}`}
                          className="w-full min-w-[120px] rounded-lg border border-slate-600/50 bg-slate-900/80 px-2 py-1.5 font-mono text-sm text-slate-100 placeholder:text-slate-600"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          value={row.rolling_rate_percent}
                          onChange={(e) => updateRow(i, "rolling_rate_percent", e.target.value)}
                          inputMode="decimal"
                          className="w-full max-w-[110px] rounded-lg border border-slate-600/50 bg-slate-900/80 px-2 py-1.5 font-mono text-sm text-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          value={row.losing_rate_percent}
                          onChange={(e) => updateRow(i, "losing_rate_percent", e.target.value)}
                          inputMode="decimal"
                          className="w-full max-w-[110px] rounded-lg border border-slate-600/50 bg-slate-900/80 px-2 py-1.5 font-mono text-sm text-slate-100"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          className="text-xs text-slate-500 hover:text-rose-400"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <datalist id={`gp-rolling-hints-${userId}`}>
              {PRIMARY_CATEGORIES.map((g) => (
                <option key={g.key} value={g.key} />
              ))}
              <option value="MINIGAME_GENERIC" />
              <option value="CASINO" />
            </datalist>
          </div>
        </>
      ) : null}
    </div>
  );
}
