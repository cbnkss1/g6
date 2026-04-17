"use client";

import { publicApiBase } from "@/lib/publicApiBase";
import { FormEvent, useEffect, useState } from "react";

type Direction = "pay" | "collect";

type Props = {
  open: boolean;
  direction: Direction;
  counterpartyId: number;
  counterpartyLogin: string;
  myBalance: string;
  counterpartyBalance: string;
  token: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function AgentP2pModal({
  open,
  direction,
  counterpartyId,
  counterpartyLogin,
  myBalance,
  counterpartyBalance,
  token,
  onClose,
  onSuccess,
}: Props) {
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount("");
      setErr(null);
    }
  }, [open, direction, counterpartyId]);

  if (!open) return null;

  const title = direction === "pay" ? "지급" : "회수";
  const accent =
    direction === "pay"
      ? "border-red-500/50 bg-red-950/40 text-red-200"
      : "border-blue-500/50 bg-blue-950/40 text-blue-200";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const base = publicApiBase();
    if (!base || !token) {
      setErr("API URL 또는 로그인이 없습니다.");
      return;
    }
    const n = Number.parseFloat(amount.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) {
      setErr("올바른 금액을 입력하세요.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${base}/api/agent/transfer`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          direction,
          counterparty_user_id: counterpartyId,
          amount: String(n),
        }),
      });
      const data = (await r.json().catch(() => null)) as { detail?: string | unknown };
      if (!r.ok) {
        const d = data?.detail;
        setErr(typeof d === "string" ? d : `요청 실패 (${r.status})`);
        return;
      }
      onSuccess();
      onClose();
    } catch {
      setErr("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="닫기"
        onClick={onClose}
      />
      <div
        className={`relative w-full max-w-md rounded-2xl border p-6 shadow-2xl ${accent}`}
        role="dialog"
        aria-modal
        aria-labelledby="p2p-title"
      >
        <h3 id="p2p-title" className="text-lg font-semibold">
          {title} — {counterpartyLogin}
        </h3>
        <p className="mt-3 text-sm opacity-90">
          {direction === "pay" ? (
            <>
              현재 나의 보유 알:{" "}
              <span className="font-mono font-bold tabular-nums">
                {Number.parseFloat(myBalance || "0").toLocaleString()}
              </span>{" "}
              (게임머니)
            </>
          ) : (
            <>
              회수 대상 팀원 보유:{" "}
              <span className="font-mono font-bold tabular-nums">
                {Number.parseFloat(counterpartyBalance || "0").toLocaleString()}
              </span>{" "}
              (게임머니)
            </>
          )}
        </p>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <div>
            <label htmlFor="p2p-amt" className="text-xs text-slate-400">
              {direction === "pay" ? "지급할 금액" : "회수할 금액"}
            </label>
            <input
              id="p2p-amt"
              type="text"
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950/80 px-3 py-2 font-mono text-slate-100 outline-none focus:ring-2 focus:ring-premium/40"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoComplete="off"
            />
          </div>
          {err && <p className="text-sm text-red-300">{err}</p>}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              className="flex-1 rounded-lg border border-slate-600 py-2 text-sm text-slate-300 hover:bg-slate-800"
              onClick={onClose}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold text-slate-950 disabled:opacity-50 ${
                direction === "pay"
                  ? "bg-red-500 hover:bg-red-400"
                  : "bg-blue-500 hover:bg-blue-400"
              }`}
            >
              {loading ? "처리 중…" : title}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
