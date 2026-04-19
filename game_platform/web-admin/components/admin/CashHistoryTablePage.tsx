"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { formatMoneyInt } from "@/lib/formatMoney";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type CashReq = {
  id: number;
  user_id: number;
  login_id: string;
  request_type: string;
  status: string;
  amount: string;
  memo: string | null;
  required_rolling_amount: string;
  reject_reason: string | null;
  created_at: string | null;
  processed_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  PROCESSING: "처리중",
  APPROVED: "승인",
  REJECTED: "거절",
};

function fmtDt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  requestType: "DEPOSIT" | "WITHDRAW";
  title: string;
  description: string;
};

export function CashHistoryTablePage({ requestType, title, description }: Props) {
  const token = useAuthStore((s) => s.token);
  const isSuperAdmin = useAuthStore((s) => s.user?.role === "super_admin");
  const base = publicApiBase();
  const [statusFilter, setStatusFilter] = useState<string>("");

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("request_type", requestType);
    p.set("sort", "recent");
    p.set("limit", "150");
    if (statusFilter) p.set("status", statusFilter);
    return p;
  }, [requestType, statusFilter]);

  const q = useQuery({
    queryKey: ["admin", "cash-requests-history", token ?? "", requestType, statusFilter],
    queryFn: async () => {
      if (!base || !token) throw new Error("no token");
      const r = await adminFetch(`${base}/admin/cash/requests?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as { items: CashReq[] };
    },
    enabled: Boolean(token),
    staleTime: 30_000,
  });

  const items = q.data?.items ?? [];

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <p className="text-premium-label">내역</p>
        <h1
          className="mt-1 text-2xl font-semibold text-slate-100"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          {title}
        </h1>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
        <p className="mt-1 text-xs text-slate-600">
          본인 계정과 추천 <strong className="text-slate-400">하부 전체</strong>의 신청만 표시됩니다.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["", "전체 상태"],
            ["PENDING", "대기·처리중"],
            ["APPROVED", "승인"],
            ["REJECTED", "거절"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v || "all"}
            type="button"
            onClick={() => setStatusFilter(v)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === v
                ? "border-premium/50 bg-premium/15 text-premium"
                : "border-slate-700 text-slate-500 hover:border-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
        {isSuperAdmin ? (
          <Link
            href="/cash"
            className="ml-auto text-xs text-slate-500 underline decoration-slate-600 hover:text-premium"
          >
            실시간 입출금 콘솔 →
          </Link>
        ) : (
          <Link
            href="/cash/request"
            className="ml-auto text-xs text-slate-500 underline decoration-slate-600 hover:text-premium"
          >
            입출금 신청 →
          </Link>
        )}
      </div>

      {q.isError ? (
        <p className="text-sm text-red-400">{(q.error as Error).message}</p>
      ) : null}
      {q.isLoading ? <p className="text-sm text-slate-500">불러오는 중…</p> : null}

      {!q.isLoading && items.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-12 text-center text-sm text-slate-500">
          해당 조건의 내역이 없습니다.
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="table-scroll overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
          <table className="w-full min-w-[880px] text-left text-sm text-slate-300">
            <thead className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="p-2.5">접수</th>
                <th className="p-2.5">회원</th>
                <th className="p-2.5">상태</th>
                <th className="p-2.5 text-right">금액</th>
                <th className="p-2.5">처리</th>
                <th className="p-2.5">메모</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-slate-800/70 hover:bg-slate-800/25">
                  <td className="whitespace-nowrap p-2.5 text-xs text-slate-400">{fmtDt(row.created_at)}</td>
                  <td className="p-2.5 font-mono text-xs text-slate-200">{row.login_id}</td>
                  <td className="p-2.5">
                    <span className="rounded border border-slate-600 bg-slate-800/50 px-2 py-0.5 text-[11px]">
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="p-2.5 text-right tabular-nums font-medium text-slate-100">
                    {formatMoneyInt(row.amount)}
                  </td>
                  <td className="whitespace-nowrap p-2.5 text-xs text-slate-500">{fmtDt(row.processed_at)}</td>
                  <td className="max-w-[200px] truncate p-2.5 text-xs text-slate-500" title={row.memo ?? ""}>
                    {row.memo || "—"}
                    {row.status === "REJECTED" && row.reject_reason ? (
                      <span className="block text-red-400/90">사유: {row.reject_reason}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
