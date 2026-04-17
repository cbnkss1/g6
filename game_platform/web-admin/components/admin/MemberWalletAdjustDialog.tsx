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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-adj-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6 shadow-2xl"
        style={{
          borderColor: "rgba(212,175,55,0.2)",
          background: "rgba(8,15,28,0.98)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wallet-adj-title" className="text-lg font-semibold text-slate-100">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          대상: <span className="font-mono text-premium">{loginId}</span> (즉시 반영, 입출금 신청 큐 없음)
        </p>
        <label className="mt-4 block text-xs text-slate-500">
          금액
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 font-mono text-slate-100"
            placeholder="0"
            autoFocus
          />
        </label>
        <label className="mt-3 block text-xs text-slate-500">
          메모 (선택)
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm text-slate-200"
          />
        </label>
        {err ? <p className="mt-3 text-sm text-red-400">{err}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800/50"
          >
            취소
          </button>
          <button
            type="button"
            disabled={loading || !amount.trim()}
            onClick={() => void submit()}
            className="rounded-xl px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
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
