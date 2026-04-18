"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { formatIsoAsKst } from "@/lib/formatKst";
import { formatMoneyInt } from "@/lib/formatMoney";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type LedgerItem = {
  id: number;
  user_id: number;
  login_id: string;
  display_name: string | null;
  delta: string;
  balance_after: string;
  reason: string;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string | null;
};

type ApiResponse = {
  items: LedgerItem[];
  limit: number;
  offset: number;
};

const PAGE = 100;

export default function HistoryPointPage() {
  const token = useAuthStore((s) => s.token);
  const [loginId, setLoginId] = useState("");
  const [appliedLogin, setAppliedLogin] = useState("");
  const [offset, setOffset] = useState(0);

  const q = useQuery({
    queryKey: [
      "admin",
      "ledger",
      "rolling-point",
      token ?? "",
      appliedLogin,
      offset,
    ],
    queryFn: async () => {
      const base = publicApiBase();
      if (!base || !token) throw new Error("missing env or token");
      const sp = new URLSearchParams();
      sp.set("limit", String(PAGE));
      sp.set("offset", String(offset));
      if (appliedLogin.trim()) sp.set("login_id", appliedLogin.trim());
      const r = await fetch(`${base}/admin/ledger/rolling-point?${sp}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`ledger ${r.status}`);
      return (await r.json()) as ApiResponse;
    },
    enabled: Boolean(token),
  });

  const items = q.data?.items ?? [];
  const canPrev = offset > 0;
  const canNext = useMemo(
    () => items.length === PAGE,
    [items.length],
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">포인트 이동내역</h2>
        <p className="mt-1 text-sm text-slate-500">
          롤링 포인트 원장(추천 롤링·조정 등). 하부 회원만 표시됩니다.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          로그인 ID 검색
          <input
            type="text"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
            placeholder="부분 일치"
          />
        </label>
        <button
          type="button"
          className="rounded-lg border border-premium/40 bg-premium/10 px-4 py-2 text-sm text-premium hover:bg-premium/20"
          onClick={() => {
            setOffset(0);
            setAppliedLogin(loginId);
          }}
        >
          검색
        </button>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-slate-500">불러오는 중…</p>
      ) : q.isError ? (
        <p className="text-sm text-red-400">
          목록을 불러오지 못했습니다. 로그인·API를 확인하세요.
        </p>
      ) : (
        <>
          <div className="table-scroll rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full min-w-[960px] text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-3">일시 (KST)</th>
                  <th className="p-3">회원</th>
                  <th className="p-3 text-right">증감(P)</th>
                  <th className="p-3 text-right">잔액(후)</th>
                  <th className="p-3">사유</th>
                  <th className="p-3">참조</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-6 text-center text-slate-500"
                    >
                      내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-slate-800/80"
                    >
                      <td className="whitespace-nowrap p-3 font-mono text-xs text-slate-400">
                        {formatIsoAsKst(row.created_at)}
                      </td>
                      <td className="p-3">
                        <span className="font-mono text-premium">
                          {row.login_id}
                        </span>
                        {row.display_name ? (
                          <span className="ml-2 text-slate-500">
                            {row.display_name}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3 text-right font-mono">{formatMoneyInt(row.delta)}</td>
                      <td className="p-3 text-right font-mono text-slate-400">
                        {formatMoneyInt(row.balance_after)}
                      </td>
                      <td className="p-3 font-mono text-xs">{row.reason}</td>
                      <td className="max-w-[220px] truncate p-3 font-mono text-xs text-slate-500">
                        {row.reference_type && row.reference_id
                          ? `${row.reference_type}:${row.reference_id}`
                          : row.reference_id ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              disabled={!canPrev}
              className="rounded border border-slate-700 px-3 py-1.5 text-slate-300 disabled:opacity-40"
              onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
            >
              이전
            </button>
            <span className="text-slate-500">
              offset {offset} · 최대 {PAGE}건
            </span>
            <button
              type="button"
              disabled={!canNext}
              className="rounded border border-slate-700 px-3 py-1.5 text-slate-300 disabled:opacity-40"
              onClick={() => setOffset((o) => o + PAGE)}
            >
              다음
            </button>
          </div>
        </>
      )}
    </div>
  );
}
