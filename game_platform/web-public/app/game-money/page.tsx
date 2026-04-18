"use client";

import Link from "next/link";
import { useState } from "react";

import { CasinoMoneyTransferPanel } from "@/components/CasinoMoneyTransferPanel";
import { PlayerLedgerPanel } from "@/components/PlayerLedgerPanel";
import { SiteHeader } from "@/components/SiteHeader";
import { usePlayerAuth } from "@/lib/playerAuthContext";
import {
  playerAdminWebUrl,
  playerMemoUrl,
  playerSupportHref,
  playerSupportIsExternal,
} from "@/lib/playerExternalLinks";
import { formatPlayerMoney } from "@/lib/formatPlayerMoney";

export default function GameMoneyPage() {
  const { token, user, hydrated, openLogin, refreshProfile } = usePlayerAuth();
  const [ledgerRefresh, setLedgerRefresh] = useState(0);
  const supportHref = playerSupportHref();
  const supportExternal = playerSupportIsExternal();
  const memoUrl = playerMemoUrl();
  const adminUrl = playerAdminWebUrl();

  return (
    <div className="flex min-h-screen flex-col bg-[#060b14] text-slate-200">
      <SiteHeader />
      <main className="mx-auto w-full max-w-lg flex-1 space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">게임머니 전환</h1>
          <p className="mt-1 text-sm text-slate-500">
            메인 지갑(게임머니)과 카지노 지갑(Plxmed) 간 이동입니다. 입금·출금 신청은{" "}
            <Link href="/wallet" className="text-premium-glow underline decoration-premium/40 underline-offset-2">
              입출금
            </Link>
            메뉴를 이용해 주세요.
          </p>
        </div>

        {user && token ? (
          <div className="glass-panel grid grid-cols-2 gap-3 p-4 text-sm">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">게임머니</p>
              <p className="mt-1 font-mono text-lg text-premium-glow">{formatPlayerMoney(user.game_money_balance)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">포인트</p>
              <p className="mt-1 font-mono text-lg text-slate-300">{formatPlayerMoney(user.rolling_point_balance)}</p>
            </div>
          </div>
        ) : null}

        <CasinoMoneyTransferPanel
          token={token}
          hydrated={hydrated}
          loggedIn={Boolean(user && token)}
          onOpenLogin={openLogin}
          onAfterTransfer={async () => {
            setLedgerRefresh((k) => k + 1);
            await refreshProfile();
          }}
          showHeading={false}
        />

        {token ? <PlayerLedgerPanel token={token} refreshKey={ledgerRefresh} /> : null}

        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/" className="text-slate-500 hover:text-premium-glow">
            ← 홈
          </Link>
          <Link href="/wallet" className="text-slate-500 hover:text-premium-glow">
            입출금
          </Link>
          <Link href="/casino" className="text-slate-500 hover:text-premium-glow">
            카지노
          </Link>
          {supportExternal ? (
            <a
              href={supportHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-premium-glow"
            >
              고객센터
            </a>
          ) : (
            <Link href={supportHref} className="text-slate-500 hover:text-premium-glow">
              고객센터
            </Link>
          )}
          {memoUrl && (
            <a
              href={memoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-premium-glow"
            >
              쪽지
            </a>
          )}
          {adminUrl && (
            <a
              href={adminUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-premium-glow"
            >
              관리자
            </a>
          )}
        </div>
      </main>
    </div>
  );
}
