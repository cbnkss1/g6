"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { formatMoneyInt } from "@/lib/formatMoney";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type ReqType = "DEPOSIT" | "WITHDRAW";

export default function CashRequestPage() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const base = publicApiBase();

  const [kind, setKind] = useState<ReqType>("DEPOSIT");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!base || !token || !user) throw new Error("로그인이 필요합니다.");
      const amt = amount.trim().replace(/,/g, "");
      if (!amt) throw new Error("금액을 입력하세요.");
      const r = await adminFetch(`${base}/admin/cash/requests`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          request_type: kind,
          amount: amt,
          memo: memo.trim() || null,
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || r.statusText);
      }
      return r.json();
    },
    onSuccess: () => {
      setMsg("신청이 접수되었습니다. 슈퍼관리자 승인 후 반영됩니다.");
      setErr(null);
      setAmount("");
      setMemo("");
      qc.invalidateQueries({ queryKey: ["admin", "cash-requests-history"] });
    },
    onError: (e: Error) => {
      setErr(e.message);
      setMsg(null);
    },
  });

  const presets = [10_000, 50_000, 100_000, 500_000, 1_000_000];

  return (
    <div className="quantum-shell mx-auto max-w-[720px] space-y-6 px-3 py-4 sm:px-5">
      <header className="quantum-hero px-5 py-5 sm:px-7 sm:py-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/90">입출금</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">입출금 신청</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
          정산·운영 비용 등으로 본인 계정에 대한 충전·환전은 <strong className="text-slate-300">슈퍼관리자 승인</strong> 후
          처리됩니다. 신청은 본인(<span className="text-premium">{user?.login_id}</span>) 기준으로 접수됩니다.
        </p>
      </header>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5 sm:p-6">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["DEPOSIT", "충전 신청"],
              ["WITHDRAW", "환전 신청"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
                kind === k
                  ? "border-premium/50 bg-premium/15 text-premium"
                  : "border-slate-700 text-slate-500 hover:border-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">금액 (원)</label>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d]/g, "");
                setAmount(v ? formatMoneyInt(v) : "");
              }}
              placeholder="0"
              className="admin-touch-input mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-lg tabular-nums text-slate-100 outline-none focus:border-premium/40"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAmount(formatMoneyInt(String(p)))}
                  className="rounded-lg border border-slate-800 px-2.5 py-1 text-[11px] text-slate-400 hover:border-slate-600"
                >
                  {formatMoneyInt(String(p))}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAmount("")}
                className="rounded-lg border border-slate-800 px-2.5 py-1 text-[11px] text-slate-500 hover:border-slate-600"
              >
                초기화
              </button>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">메모 (선택)</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              placeholder="입금자명, 계좌 요청 사항 등"
              className="admin-touch-input mt-1 w-full resize-none rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-200 outline-none focus:border-premium/40"
            />
          </div>

          {msg ? (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">{msg}</p>
          ) : null}
          {err ? (
            <p className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">{err}</p>
          ) : null}

          <button
            type="button"
            disabled={createMut.isPending}
            onClick={() => createMut.mutate()}
            className="admin-touch-btn w-full rounded-xl py-3.5 text-sm font-bold text-slate-950 disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#d4af37,#9a8028)" }}
          >
            {createMut.isPending ? "접수 중…" : kind === "DEPOSIT" ? "충전 신청" : "환전 신청"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <Link href="/history/charge" className="underline decoration-slate-600 hover:text-premium">
          최근 충전내역 →
        </Link>
        <Link href="/history/exchange" className="underline decoration-slate-600 hover:text-premium">
          최근 환전내역 →
        </Link>
      </div>
    </div>
  );
}
