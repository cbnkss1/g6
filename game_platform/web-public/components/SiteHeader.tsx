"use client";

import Link from "next/link";

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
            {supportUrl && (
              <a href={supportUrl} target="_blank" rel="noopener noreferrer" className={extLink}>
                고객센터
              </a>
            )}
            {memoUrl && (
              <a href={memoUrl} target="_blank" rel="noopener noreferrer" className={extLink}>
                쪽지
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
              <div className="flex min-w-0 max-w-[min(52vw,14rem)] flex-col items-end gap-0.5 text-right sm:max-w-none md:flex-row md:items-baseline md:gap-2">
                <span className="font-mono text-[11px] tabular-nums text-quantum-cyan/90 sm:text-xs">
                  보유 {formatPlayerMoney(user.game_money_balance)}원
                </span>
                <span className="font-mono text-[10px] tabular-nums text-slate-500">
                  롤링P {formatPlayerMoney(user.rolling_point_balance)}P
                </span>
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
                  쪽지
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
