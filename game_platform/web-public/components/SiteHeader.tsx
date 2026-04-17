"use client";

import Link from "next/link";

import { usePlayerAuth } from "@/lib/playerAuthContext";
import { playerAdminWebUrl, playerMemoUrl, playerSupportUrl } from "@/lib/playerExternalLinks";

export function SiteHeader() {
  const { user, hydrated, openLogin, openRegister, logout } = usePlayerAuth();
  const supportUrl = playerSupportUrl();
  const memoUrl = playerMemoUrl();
  const adminUrl = playerAdminWebUrl();

  const extLink =
    "rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-400 hover:border-premium/30 hover:text-premium-glow sm:text-sm";

  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-[#060b14]/90 backdrop-blur-md">
      <div className="mx-auto flex min-h-14 max-w-[1600px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:flex-nowrap sm:px-6 sm:py-0">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Link
            href="/"
            className="font-display text-lg font-semibold tracking-wide text-premium sm:text-2xl"
            style={{ textShadow: "0 0 24px rgba(212,175,55,0.35)" }}
          >
            SLOTPASS
          </Link>
          <span className="hidden text-[10px] uppercase tracking-[0.25em] text-slate-500 lg:inline">
            quantum
          </span>
          <nav className="hidden items-center gap-1 md:flex">
            <Link
              href="/wallet"
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-premium-glow sm:text-sm"
            >
              입출금
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
              <span className="hidden font-mono text-xs text-premium/90 xl:inline">
                {user.game_money_balance != null ? user.game_money_balance : "—"}
              </span>
              <span className="hidden max-w-[120px] truncate text-sm text-slate-400 sm:inline md:max-w-[160px]">
                {user.display_name || user.login_id}
              </span>
              <Link
                href="/wallet"
                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:border-premium/30 hover:text-premium-glow md:hidden"
              >
                입출금
              </Link>
              {supportUrl && (
                <a
                  href={supportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-slate-400 hover:text-premium-glow md:hidden"
                >
                  고객
                </a>
              )}
              {memoUrl && (
                <a
                  href={memoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-slate-400 hover:text-premium-glow md:hidden"
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
                className="hidden rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-400 hover:text-premium-glow sm:inline"
              >
                입출금
              </Link>
              <button
                type="button"
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:border-premium/30 hover:text-premium-glow"
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
