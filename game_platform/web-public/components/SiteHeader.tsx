"use client";

import Link from "next/link";
import { motion } from "framer-motion";

import { formatPlayerMoney } from "@/lib/formatPlayerMoney";
import { usePlayerAuth } from "@/lib/playerAuthContext";
import { playerAdminWebUrl, playerMemoUrl, playerSupportUrl } from "@/lib/playerExternalLinks";

export function SiteHeader() {
  const { user, hydrated, openLogin, openRegister, logout } = usePlayerAuth();
  const supportUrl = playerSupportUrl();
  const memoUrl = playerMemoUrl();
  const adminUrl = playerAdminWebUrl();

  const extLink =
    "rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-400 hover:border-quantum-cyan/35 hover:text-quantum-cyan sm:text-sm";

  const gmStr = user ? formatPlayerMoney(user.game_money_balance) : "—";
  const rpStr = user ? formatPlayerMoney(user.rolling_point_balance) : "—";

  return (
    <header className="sticky top-0 z-20 border-b border-quantum-cyan/15 bg-[#060b14]/92 backdrop-blur-md shadow-[0_0_32px_rgba(34,211,238,0.06)]">
      <div className="mx-auto flex min-h-14 max-w-[1600px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:flex-nowrap sm:px-6 sm:py-0">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Link href="/" className="group flex items-baseline gap-2">
            <span className="bg-gradient-to-r from-quantum-cyan via-white to-quantum-magenta bg-clip-text font-display text-lg font-semibold tracking-wide text-transparent drop-shadow-quantum sm:text-2xl">
              SLOTPASS
            </span>
            <span className="hidden text-[10px] font-bold uppercase tracking-[0.35em] text-quantum-magenta/90 lg:inline">
              Quantum
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <Link
              href="/wallet"
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:bg-quantum-cyan/5 hover:text-quantum-cyan sm:text-sm"
            >
              입출금
            </Link>
            <Link
              href="/game-money#rolling"
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:bg-quantum-cyan/5 hover:text-quantum-cyan sm:text-sm"
            >
              포인트 전환
            </Link>
            <Link
              href="/game-money#casino"
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:bg-quantum-cyan/5 hover:text-quantum-cyan sm:text-sm"
            >
              카지노 전환
            </Link>
            <Link
              href="/messages"
              className="rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-2.5 py-1.5 text-xs font-medium text-amber-200/95 hover:border-amber-400/45 hover:bg-amber-500/15 sm:text-sm"
            >
              쪽지함
            </Link>
            {supportUrl && (
              <a href={supportUrl} target="_blank" rel="noopener noreferrer" className={extLink}>
                고객센터
              </a>
            )}
            {memoUrl && (
              <a href={memoUrl} target="_blank" rel="noopener noreferrer" className={extLink}>
                쪽지(외부)
              </a>
            )}
            {adminUrl && (
              <a href={adminUrl} target="_blank" rel="noopener noreferrer" className={extLink}>
                관리자
              </a>
            )}
          </nav>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {hydrated && user ? (
            <>
              <div className="flex min-w-0 max-w-[min(90vw,22rem)] flex-wrap items-center justify-end gap-1.5 sm:max-w-none sm:gap-2">
                <div className="relative overflow-hidden rounded-xl border border-cyan-400/25 bg-gradient-to-br from-cyan-500/[0.12] via-slate-900/40 to-slate-950/80 px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_0_20px_rgba(34,211,238,0.08)] sm:px-3 sm:py-2">
                  <div
                    className="pointer-events-none absolute -right-4 -top-4 h-14 w-14 rounded-full bg-cyan-400/15 blur-2xl"
                    aria-hidden
                  />
                  <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-cyan-300/75 sm:text-[9px]">
                    보유 머니
                  </p>
                  <div className="mt-0.5 flex items-baseline gap-0.5">
                    <motion.span
                      key={gmStr}
                      className="font-mono text-sm font-semibold tabular-nums tracking-tight text-cyan-100 drop-shadow-[0_0_12px_rgba(34,211,238,0.35)] sm:text-base"
                      initial={{ opacity: 0.65, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 420, damping: 28 }}
                    >
                      {gmStr}
                    </motion.span>
                    <span className="text-[10px] font-medium text-cyan-200/50">원</span>
                  </div>
                </div>
                <div className="relative overflow-hidden rounded-xl border border-amber-400/20 bg-gradient-to-br from-amber-500/[0.08] via-slate-900/35 to-slate-950/80 px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_18px_rgba(251,191,36,0.06)] sm:px-3 sm:py-2">
                  <div
                    className="pointer-events-none absolute -right-3 -top-3 h-12 w-12 rounded-full bg-amber-400/10 blur-2xl"
                    aria-hidden
                  />
                  <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-amber-200/70 sm:text-[9px]">
                    롤링 포인트
                  </p>
                  <div className="mt-0.5 flex items-baseline gap-0.5">
                    <motion.span
                      key={rpStr}
                      className="font-mono text-sm font-semibold tabular-nums tracking-tight text-amber-100/95 drop-shadow-[0_0_10px_rgba(251,191,36,0.2)] sm:text-base"
                      initial={{ opacity: 0.65, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 420, damping: 28 }}
                    >
                      {rpStr}
                    </motion.span>
                    <span className="text-[10px] font-medium text-amber-200/45">P</span>
                  </div>
                </div>
              </div>
              <span className="hidden max-w-[120px] truncate text-sm text-slate-400 sm:inline md:max-w-[160px]">
                {user.display_name || user.login_id}
              </span>
              <Link
                href="/wallet"
                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:border-quantum-cyan/35 hover:text-quantum-cyan md:hidden"
              >
                입출금
              </Link>
              <Link
                href="/game-money#rolling"
                className="rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-slate-400 hover:border-quantum-cyan/35 hover:text-quantum-cyan md:hidden"
              >
                포인트
              </Link>
              <Link
                href="/game-money#casino"
                className="rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-slate-400 hover:border-quantum-cyan/35 hover:text-quantum-cyan md:hidden"
              >
                카지노
              </Link>
              <Link
                href="/messages"
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] font-medium text-amber-200/90 hover:border-amber-400/45 md:hidden"
              >
                쪽지함
              </Link>
              {supportUrl && (
                <a
                  href={supportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-slate-400 hover:text-quantum-cyan md:hidden"
                >
                  고객
                </a>
              )}
              {memoUrl && (
                <a
                  href={memoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-slate-400 hover:text-quantum-cyan md:hidden"
                >
                  외부쪽지
                </a>
              )}
              <button
                type="button"
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:border-red-400/30 hover:text-red-300"
                onClick={() => logout()}
              >
                로그아웃
              </button>
            </>
          ) : (
            <>
              <Link
                href="/wallet"
                className="hidden rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-400 hover:text-quantum-cyan sm:inline"
              >
                입출금
              </Link>
              <Link
                href="/game-money#rolling"
                className="hidden rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-slate-400 hover:text-quantum-cyan sm:inline"
              >
                포인트
              </Link>
              <Link
                href="/game-money#casino"
                className="hidden rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-slate-400 hover:text-quantum-cyan sm:inline"
              >
                카지노
              </Link>
              <button
                type="button"
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:border-quantum-cyan/35 hover:text-quantum-cyan"
                onClick={() => openLogin()}
              >
                로그인
              </button>
              <button
                type="button"
                className="rounded-lg bg-gradient-to-r from-emerald-400 to-green-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:opacity-95"
                onClick={() => openRegister()}
              >
                회원가입
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
