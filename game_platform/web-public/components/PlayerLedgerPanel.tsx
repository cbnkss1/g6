"use client";

import { useCallback, useEffect, useState } from "react";

import {
  playerListGameMoneyLedger,
  playerListRollingLedger,
  type LedgerEntryPublic,
} from "@/lib/playerApi";
import { formatPlayerMoney } from "@/lib/formatPlayerMoney";

type Props = {
  token: string | null;
  /** 외부에서 잔고 갱신 후 이 값을 바꾸면 목록을 다시 불러옵니다. */
  refreshKey?: number;
};

export function PlayerLedgerPanel({ token, refreshKey = 0 }: Props) {
  const [ledgerTab, setLedgerTab] = useState<"game" | "rolling">("game");
  const [ledgerGm, setLedgerGm] = useState<LedgerEntryPublic[]>([]);
  const [ledgerRp, setLedgerRp] = useState<LedgerEntryPublic[]>([]);
  const [ledgerErr, setLedgerErr] = useState<string | null>(null);

  const loadLedgers = useCallback(async () => {
    if (!token) return;
    setLedgerErr(null);
    try {
      const [a, b] = await Promise.all([
        playerListGameMoneyLedger(token, 40, 0),
        playerListRollingLedger(token, 40, 0),
      ]);
      setLedgerGm(a.items);
      setLedgerRp(b.items);
    } catch (e) {
      setLedgerErr(e instanceof Error ? e.message : "내역을 불러오지 못했습니다.");
    }
  }, [token]);

  useEffect(() => {
    void loadLedgers();
  }, [loadLedgers, refreshKey]);

  if (!token) return null;

  return (
    <div className="glass-panel overflow-hidden p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-300">잔고 변동 내역</h2>
        <button
          type="button"
          onClick={() => void loadLedgers()}
          className="text-[11px] text-slate-500 hover:text-premium-glow"
        >
          새로고침
        </button>
      </div>
      <div className="mb-3 flex rounded-lg border border-white/10 p-0.5">
        <button
          type="button"
          className={`flex-1 rounded-md py-2 text-xs font-medium transition ${
            ledgerTab === "game"
              ? "bg-premium/20 text-premium-glow"
              : "text-slate-500 hover:text-slate-300"
          }`}
          onClick={() => setLedgerTab("game")}
        >
          게임머니
        </button>
        <button
          type="button"
          className={`flex-1 rounded-md py-2 text-xs font-medium transition ${
            ledgerTab === "rolling"
              ? "bg-premium/20 text-premium-glow"
              : "text-slate-500 hover:text-slate-300"
          }`}
          onClick={() => setLedgerTab("rolling")}
        >
          포인트
        </button>
      </div>
      {ledgerErr ? <p className="text-sm text-amber-400">{ledgerErr}</p> : null}
      {!ledgerErr && (ledgerTab === "game" ? ledgerGm.length === 0 : ledgerRp.length === 0) && (
        <p className="text-sm text-slate-500">표시할 내역이 없습니다.</p>
      )}
      <ul className="mt-2 max-h-72 divide-y divide-white/5 overflow-y-auto text-xs">
        {(ledgerTab === "game" ? ledgerGm : ledgerRp).map((row) => {
          const d = Number(row.delta);
          const pos = Number.isFinite(d) && d >= 0;
          return (
            <li key={row.id} className="py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-slate-400">{row.reason_label}</span>
                <span className={`font-mono font-medium ${pos ? "text-emerald-400" : "text-rose-300"}`}>
                  {pos ? "+" : ""}
                  {formatPlayerMoney(row.delta)}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-slate-600">
                <span>
                  잔액 <span className="font-mono text-slate-500">{formatPlayerMoney(row.balance_after)}</span>
                </span>
                {row.created_at ? (
                  <time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString("ko-KR")}</time>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
