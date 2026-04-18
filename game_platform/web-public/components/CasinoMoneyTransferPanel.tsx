"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchCasinoWalletStatus,
  transferFromCasinoWallet,
  transferToCasinoWallet,
} from "@/lib/playerGamesApi";
import { formatPlayerMoney } from "@/lib/formatPlayerMoney";

type Props = {
  token: string | null;
  hydrated: boolean;
  loggedIn: boolean;
  onOpenLogin: () => void;
  onAfterTransfer: () => Promise<void>;
  /** 입출금 페이지에 넣을 때는 제목 표시, /game-money 전용 페이지에서는 false */
  showHeading?: boolean;
};

export function CasinoMoneyTransferPanel({
  token,
  hydrated,
  loggedIn,
  onOpenLogin,
  onAfterTransfer,
  showHeading = true,
}: Props) {
  const [casinoBal, setCasinoBal] = useState<string | null>(null);
  const [plxmedDemo, setPlxmedDemo] = useState(false);
  const [casinoErr, setCasinoErr] = useState<string | null>(null);
  const [casinoBusy, setCasinoBusy] = useState(false);
  const [casinoIn, setCasinoIn] = useState("");
  const [casinoOut, setCasinoOut] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const loadCasino = useCallback(async () => {
    if (!token) return;
    setCasinoErr(null);
    try {
      const s = await fetchCasinoWalletStatus(token);
      setCasinoBal(s.casino_balance);
      setPlxmedDemo(Boolean(s.plxmed_transfer_demo));
    } catch (e) {
      setCasinoBal(null);
      setPlxmedDemo(false);
      setCasinoErr(e instanceof Error ? e.message : "카지노 잔액을 불러오지 못했습니다.");
    }
  }, [token]);

  useEffect(() => {
    if (hydrated && token) void loadCasino();
  }, [hydrated, token, loadCasino]);

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
        <p className="text-sm text-slate-400">로그인 후 게임머니 전환을 이용할 수 있습니다.</p>
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
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-300">카지노머니 전환</h2>
          <button
            type="button"
            onClick={() => void loadCasino()}
            className="text-[11px] text-slate-500 hover:text-premium-glow"
          >
            카지노 잔액 새로고침
          </button>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadCasino()}
            className="text-[11px] text-slate-500 hover:text-premium-glow"
          >
            카지노 잔액 새로고침
          </button>
        </div>
      )}
      {plxmedDemo ? (
        <p className="text-xs leading-relaxed text-amber-200/80">
          <strong className="text-amber-300/90">원장만 전환 모드:</strong> 상단 DEMO 배너와 별개입니다. 이
          모드에서는 Plxmed로 돈이 안 넘어가 <strong className="text-amber-200">게임에서 배팅할 수 없습니다.</strong>{" "}
          방문자에게 배팅 체험을 주려면 서버에서{" "}
          <code className="rounded bg-black/40 px-1 text-[10px] text-slate-300">
            PLXMED_TRANSFER_DEMO_MODE=false
          </code>{" "}
          (및 ledger_only false)로 두고 에이전트 Plxmed 잔고를 확보하세요.
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-slate-500">
          게임머니 → 카지노는 Plxmed 에이전트(상위) 선충전 잔고에서 회원 카지노 지갑으로 옮깁니다. 에이전트 쪽에
          남은 한도가 있으면 <strong className="text-slate-400">어느 회원이든</strong> 그 범위 안에서 넣기를 신청할 수
          있습니다. 아래 &quot;카지노 지갑&quot; 숫자는 본인 Plxmed 지갑이며, 관리자에 보이는 에이전트 잔고와는
          항목이 다릅니다.
        </p>
      )}
      {note && <p className="text-sm text-emerald-400/90">{note}</p>}
      {casinoErr && <p className="text-sm text-amber-400">{casinoErr}</p>}
      <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          카지노 지갑 잔액{plxmedDemo ? " (시연)" : " (Plxmed)"}
        </p>
        <p className="mt-1 font-mono text-lg text-amber-200/90">
          {casinoBal != null ? formatPlayerMoney(casinoBal) : "—"}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-[11px] text-slate-500">게임머니 → 카지노</p>
          <input
            type="text"
            inputMode="decimal"
            value={casinoIn}
            onChange={(e) => setCasinoIn(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-premium/40"
            placeholder="금액"
          />
          <button
            type="button"
            disabled={casinoBusy}
            onClick={async () => {
              if (!token) return;
              setCasinoBusy(true);
              setNote(null);
              try {
                await transferToCasinoWallet(token, casinoIn.trim());
                setCasinoIn("");
                setCasinoErr(null);
                setNote("카지노 지갑으로 전환되었습니다.");
                await onAfterTransfer();
                await loadCasino();
              } catch (e) {
                setNote(null);
                setCasinoErr(e instanceof Error ? e.message : "전환에 실패했습니다.");
              } finally {
                setCasinoBusy(false);
              }
            }}
            className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 py-2 text-sm font-medium text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
          >
            {casinoBusy ? "처리 중…" : "카지노로 넣기"}
          </button>
        </div>
        <div className="space-y-2">
          <p className="text-[11px] text-slate-500">카지노 → 게임머니</p>
          <input
            type="text"
            inputMode="decimal"
            value={casinoOut}
            onChange={(e) => setCasinoOut(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-premium/40"
            placeholder="금액"
          />
          <button
            type="button"
            disabled={casinoBusy}
            onClick={async () => {
              if (!token) return;
              setCasinoBusy(true);
              setNote(null);
              try {
                await transferFromCasinoWallet(token, casinoOut.trim());
                setCasinoOut("");
                setCasinoErr(null);
                setNote("게임머니로 전환되었습니다.");
                await onAfterTransfer();
                await loadCasino();
              } catch (e) {
                setNote(null);
                setCasinoErr(e instanceof Error ? e.message : "전환에 실패했습니다.");
              } finally {
                setCasinoBusy(false);
              }
            }}
            className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {casinoBusy ? "처리 중…" : "게임머니로 빼기"}
          </button>
        </div>
      </div>
    </div>
  );
}
