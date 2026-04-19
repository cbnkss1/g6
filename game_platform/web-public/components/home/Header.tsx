"use client";

import Link from "next/link";
import { motion } from "framer-motion";

import { formatPlayerMoney } from "@/lib/formatPlayerMoney";
import { usePlayerAuth } from "@/lib/playerAuthContext";

function GlowIconButton({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={label}
      className="group relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-cyan-400/40 hover:text-cyan-200 hover:shadow-[0_0_20px_rgba(34,211,238,0.25)]"
    >
      <span className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition group-hover:opacity-100 group-hover:shadow-[0_0_24px_rgba(212,175,55,0.15)]" />
      {children}
    </Link>
  );
}

export function Header() {
  const { user, hydrated, openLogin, openRegister, logout } = usePlayerAuth();

  const gmStr = user ? formatPlayerMoney(user.game_money_balance) : "—";
  const rpStr = user ? formatPlayerMoney(user.rolling_point_balance) : "—";

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#121212]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[60px] max-w-[1800px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="group flex items-baseline gap-2 shrink-0">
          <span className="font-display text-xl font-semibold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-amber-300/90 sm:text-2xl">
            SLOTPASS
          </span>
          <span className="hidden text-[9px] font-bold uppercase tracking-[0.35em] text-amber-400/70 sm:inline">
            Elite
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
          {hydrated && user ? (
            <>
              {/* SiteHeader 와 동일: 보유머니 + 롤링 포인트 카드 (메인 전용 Elite 헤더에도 반영) */}
              <div className="flex min-w-0 max-w-[min(92vw,28rem)] flex-wrap items-center justify-end gap-1.5 sm:gap-2">
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

              <GlowIconButton href="/support" label="1:1 문의">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </GlowIconButton>
              <GlowIconButton href="/mypage" label="정보 수정">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </GlowIconButton>

              <button
                type="button"
                onClick={() => logout()}
                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-400 transition hover:border-red-400/30 hover:text-red-300 sm:px-3"
              >
                로그아웃
              </button>
            </>
          ) : hydrated ? (
            <>
              <button
                type="button"
                onClick={() => openLogin()}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 transition hover:border-cyan-400/35 hover:text-cyan-200"
              >
                로그인
              </button>
              <button
                type="button"
                onClick={() => openRegister()}
                className="rounded-lg bg-gradient-to-r from-amber-500/90 to-amber-600/90 px-3 py-1.5 text-sm font-medium text-[#121212] shadow-[0_0_20px_rgba(212,175,55,0.25)] transition hover:opacity-95"
              >
                회원가입
              </button>
            </>
          ) : (
            <span className="text-xs text-slate-500">…</span>
          )}
        </div>
      </div>
    </header>
  );
}
