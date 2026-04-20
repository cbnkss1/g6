"use client";

import { useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { publicApiBase } from "@/lib/publicApiBase";

type Props = {
  token: string;
  userId: number;
  loginId: string;
  mode: "credit" | "debit";
  onClose: () => void;
  onSuccess: () => void;
};

export function MemberWalletAdjustDialog({ token, userId, loginId, mode, onClose, onSuccess }: Props) {
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const title = mode === "credit" ? "게임머니 지급" : "게임머니 회수";

  async function submit() {
    setErr(null);
    const base = publicApiBase();
    if (!base) {
      setErr("API 베이스 없음");
      return;
    }
    setLoading(true);
    try {
      const r = await adminFetch(`${base}/admin/users/${userId}/wallet/adjust`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ direction: mode, amount: amount.trim(), memo: memo.trim() || undefined }),
      });
      if (!r.ok) {
        setErr(await r.text());
        return;
      }
      onSuccess();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ background: "rgba(2,6,23,0.78)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-adj-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-amber-500/25 bg-[rgba(8,15,28,0.98)] p-4 shadow-[0_-12px_48px_rgba(0,0,0,0.55)] sm:rounded-2xl sm:p-6 sm:shadow-2xl"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wallet-adj-title" className="text-lg font-semibold text-slate-100 sm:text-xl">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          대상:{" "}
          <span className="font-mono font-semibold text-amber-200/95">{loginId}</span>
          <span className="mt-1 block text-[11px] text-slate-500 sm:inline sm:mt-0 sm:before:content-['_']">
            즉시 반영 · 입출금 신청 큐 없음
          </span>
        </p>
        <label className="mt-5 block text-xs font-medium uppercase tracking-wider text-slate-500">
          금액
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="admin-touch-input mt-2 w-full min-h-[52px] rounded-xl border border-slate-700 bg-slate-950/90 px-4 text-center text-lg font-mono tabular-nums text-slate-100 outline-none focus:border-amber-500/40"
            placeholder="0"
            autoFocus
          />
        </label>
        <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-slate-500">
          메모 (선택)
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={3}
            className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-amber-500/40"
            placeholder="내용 입력"
          />
        </label>
        {err ? <p className="mt-3 text-sm text-red-400">{err}</p> : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] w-full rounded-xl border border-slate-600 bg-slate-900/80 px-4 text-sm font-medium text-slate-200 hover:bg-slate-800 sm:w-auto sm:min-w-[100px]"
          >
            취소
          </button>
          <button
            type="button"
            disabled={loading || !amount.trim()}
            onClick={() => void submit()}
            className="min-h-[48px] w-full rounded-xl px-5 text-sm font-semibold text-slate-950 shadow-lg disabled:opacity-40 sm:w-auto sm:min-w-[120px]"
            style={{
              background:
                mode === "credit"
                  ? "linear-gradient(135deg, #22c55e, #15803d)"
                  : "linear-gradient(135deg, #f87171, #b91c1c)",
            }}
          >
            {loading ? "처리 중…" : "확인"}
          </button>
        </div>
      </div>
    </div>
  );
}
