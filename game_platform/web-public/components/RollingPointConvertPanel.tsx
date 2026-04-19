"use client";

import { useState } from "react";

import { playerConvertRollingToGameMoney } from "@/lib/playerApi";
import { formatPlayerMoney } from "@/lib/formatPlayerMoney";

type Props = {
  token: string | null;
  hydrated: boolean;
  loggedIn: boolean;
  /** 표시용 롤링 포인트 (문자열 금액) */
  rollingBalance: string | null | undefined;
  onOpenLogin: () => void;
  onAfterConvert: () => Promise<void>;
  showHeading?: boolean;
};

export function RollingPointConvertPanel({
  token,
  hydrated,
  loggedIn,
  rollingBalance,
  onOpenLogin,
  onAfterConvert,
  showHeading = true,
}: Props) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!hydrated) {
    return (
      <div className="glass-panel p-5">
        <p className="text-sm text-slate-500">세션 확인 중…</p>
      </div>
    );
  }
  if (!loggedIn || !token) {
    return (
      <div className="glass-panel space-y-3 p-5">
        <p className="text-sm text-slate-400">로그인 후 포인트 전환을 이용할 수 있습니다.</p>
        <button
          type="button"
          onClick={() => onOpenLogin()}
          className="rounded-lg bg-gradient-to-r from-emerald-400 to-green-500 px-4 py-2 text-sm font-semibold text-slate-950"
        >
          로그인
        </button>
      </div>
    );
  }

  return (
    <div className="glass-panel space-y-4 p-5">
      {showHeading ? (
        <h2 className="text-sm font-semibold text-slate-300">포인트 → 게임머니 전환</h2>
      ) : null}
      <p className="text-xs leading-relaxed text-slate-500">
        롤링 포인트를 게임머니로 바꿉니다. 전환한 금액은 즉시 메인 지갑에 반영됩니다.
      </p>
      <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">보유 롤링 포인트</p>
        <p className="mt-1 font-mono text-lg text-slate-200">{formatPlayerMoney(rollingBalance)}</p>
      </div>
      {note ? <p className="text-sm text-emerald-400/90">{note}</p> : null}
      {err ? <p className="text-sm text-amber-400">{err}</p> : null}
      <div className="space-y-2">
        <label className="text-[11px] text-slate-500">전환할 포인트 (원 단위)</label>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setErr(null);
            setNote(null);
          }}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-premium/40"
          placeholder="0"
        />
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!token) return;
            const raw = amount.trim();
            if (!raw) {
              setErr("금액을 입력해 주세요.");
              return;
            }
            setBusy(true);
            setErr(null);
            setNote(null);
            try {
              await playerConvertRollingToGameMoney(token, raw);
              setAmount("");
              setNote("게임머니로 전환되었습니다.");
              await onAfterConvert();
            } catch (e) {
              setNote(null);
              setErr(e instanceof Error ? e.message : "전환에 실패했습니다.");
            } finally {
              setBusy(false);
            }
          }}
          className="w-full rounded-lg border border-sky-500/30 bg-sky-500/10 py-2 text-sm font-medium text-sky-100 hover:bg-sky-500/20 disabled:opacity-50"
        >
          {busy ? "처리 중…" : "포인트 → 게임머니 전환"}
        </button>
      </div>
    </div>
  );
}
