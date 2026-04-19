"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { formatMoneyInt } from "@/lib/formatMoney";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type Dash = {
  viewer_game_money_balance?: string;
  viewer_rolling_point_balance?: string;
};

type HistRow = {
  id: number;
  converted_amount: string;
  game_money_balance_after: string;
  created_at: string | null;
  label: string;
};

export default function CashTransferPage() {
  const token = useAuthStore((s) => s.token);
  const base = publicApiBase();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const dashQ = useQuery({
    queryKey: ["admin", "dashboard", "today", token ?? ""],
    queryFn: async () => {
      if (!base || !token) throw new Error("no token");
      const r = await adminFetch(`${base}/admin/dashboard/today`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<Dash & Record<string, unknown>>;
    },
    enabled: Boolean(token && base),
    refetchInterval: 25_000,
  });

  const histQ = useQuery({
    queryKey: ["admin", "rolling-convert-history", token ?? ""],
    queryFn: async () => {
      if (!base || !token) throw new Error("no token");
      const r = await adminFetch(`${base}/admin/wallet/rolling-convert-history?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{ items: HistRow[] }>;
    },
    enabled: Boolean(token && base),
  });

  const convertMut = useMutation({
    mutationFn: async () => {
      if (!base || !token) throw new Error("로그인이 필요합니다.");
      const raw = amount.trim().replace(/,/g, "");
      if (!raw) throw new Error("전환할 금액을 입력하세요.");
      const r = await adminFetch(`${base}/admin/wallet/convert-rolling`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: raw }),
      });
      if (!r.ok) {
        const t = await r.text();
        let msg = t;
        try {
          const j = JSON.parse(t) as { detail?: string };
          if (typeof j.detail === "string") msg = j.detail;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      return r.json() as Promise<{ ok: boolean }>;
    },
    onSuccess: () => {
      setAmount("");
      setErr(null);
      void qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      void qc.invalidateQueries({ queryKey: ["admin", "rolling-convert-history"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const gm = dashQ.data?.viewer_game_money_balance;
  const rp = dashQ.data?.viewer_rolling_point_balance;
  const items = histQ.data?.items ?? [];

  return (
    <div className="quantum-shell mx-auto max-w-[900px] space-y-6 px-3 py-4 sm:px-5">
      <header className="quantum-hero px-5 py-5 sm:px-7 sm:py-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/90">입출금</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">머니 · 포인트 전환</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          <strong className="text-slate-300">롤링 포인트</strong>는 배팅 정산으로 쌓이는{" "}
          <strong className="text-slate-300">마일리지(포인트)</strong>와 동일합니다. 보유 포인트를{" "}
          <strong className="text-amber-200/90">게임머니</strong>로 전환합니다. (카지노·슬롯 등 종목별로 나뉘지 않고
          하나의 포인트 풀입니다.)
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <div
          className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-950/40 to-slate-950/60 p-5"
          style={{ boxShadow: "0 0 32px -8px rgba(245,158,11,0.2)" }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">보유 게임머니</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-100">
            {gm != null ? formatMoneyInt(gm) : dashQ.isLoading ? "…" : "—"}
            <span className="ml-1 text-sm font-normal text-amber-500/80">원</span>
          </p>
        </div>
        <div
          className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-950/35 to-slate-950/60 p-5"
          style={{ boxShadow: "0 0 32px -8px rgba(167,139,250,0.18)" }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300/85">보유 포인트 (마일리지)</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-violet-100">
            {rp != null ? formatMoneyInt(rp) : dashQ.isLoading ? "…" : "—"}
            <span className="ml-1 text-sm font-normal text-violet-400/80">P</span>
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-slate-200">포인트 → 게임머니 전환</h2>
        <div className="mt-4 rounded-xl border border-sky-500/20 bg-sky-950/20 px-4 py-3 text-xs leading-relaxed text-sky-200/90">
          · 전환 후 게임머니 잔액이 즉시 반영됩니다.
          <br />· 카지노·슬롯 등으로 <strong className="text-sky-100">나뉜 마일리지</strong>가 아니라, 시스템의{" "}
          <strong className="text-sky-100">통합 롤링 포인트</strong>를 사용합니다.
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">전환 금액 (원)</span>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d]/g, "");
                setAmount(v ? formatMoneyInt(v) : "");
              }}
              placeholder="0"
              className="admin-touch-input rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 font-mono text-lg tabular-nums text-slate-100 outline-none focus:border-premium/40"
            />
          </label>
          <button
            type="button"
            disabled={convertMut.isPending || !amount.trim()}
            onClick={() => convertMut.mutate()}
            className="admin-touch-btn shrink-0 rounded-xl px-8 py-3 text-sm font-bold text-slate-950 disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#a78bfa,#7c3aed)" }}
          >
            {convertMut.isPending ? "처리 중…" : "전환하기"}
          </button>
        </div>
        {err ? <p className="mt-3 text-sm text-red-400">{err}</p> : null}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-slate-200">전환 내역</h2>
        {histQ.isLoading ? <p className="mt-4 text-sm text-slate-500">불러오는 중…</p> : null}
        {histQ.isError ? (
          <p className="mt-4 text-sm text-red-400">{(histQ.error as Error).message}</p>
        ) : null}
        {!histQ.isLoading && items.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">전환 내역이 없습니다.</p>
        ) : null}
        {items.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800/80">
            <table className="w-full min-w-[520px] text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-900/60 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">일시</th>
                  <th className="px-3 py-2 text-right">전환액</th>
                  <th className="px-3 py-2 text-right">전환 후 게임머니</th>
                  <th className="px-3 py-2">내용</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-800/60 hover:bg-slate-900/40">
                    <td className="px-3 py-2 text-slate-400">
                      {row.created_at ? new Date(row.created_at).toLocaleString("ko-KR") : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-300/90">
                      {formatMoneyInt(row.converted_amount)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-200">
                      {formatMoneyInt(row.game_money_balance_after)}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{row.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
