"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { PlayerPasswordChangeSection } from "@/components/mypage/PlayerPasswordChangeSection";
import { PlainArticle } from "@/components/PlainArticle";
import { SiteHeader } from "@/components/SiteHeader";
import { formatPlayerMoney } from "@/lib/formatPlayerMoney";
import { usePlayerAuth } from "@/lib/playerAuthContext";
import { playerListNotifications } from "@/lib/playerApi";
import { fetchPlayerPublicPages } from "@/lib/playerPortal";

export default function MyPagePage() {
  const { user, hydrated, token, openLogin } = usePlayerAuth();
  const [intro, setIntro] = useState("");
  const [unread, setUnread] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setErr(null);
      try {
        const d = await fetchPlayerPublicPages(user?.site_id ?? null);
        if (!cancel) setIntro(d.pages.mypage_intro);
      } catch (e) {
        if (!cancel) setErr(e instanceof Error ? e.message : "로드 실패");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [user?.site_id]);

  useEffect(() => {
    if (!token) {
      setUnread(null);
      return;
    }
    let cancel = false;
    (async () => {
      try {
        const { items } = await playerListNotifications(token, 200);
        if (!cancel) setUnread(items.filter((x) => !x.read_at).length);
      } catch {
        if (!cancel) setUnread(null);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [token]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {err ? (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {err}
          </p>
        ) : null}

        {!hydrated ? (
          <p className="text-sm text-slate-500">불러오는 중…</p>
        ) : user ? (
          <>
            <div className="glass-panel mb-6 overflow-hidden p-0">
              <div className="border-b border-white/10 bg-gradient-to-r from-slate-950/80 via-slate-900/50 to-slate-950/80 px-6 py-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-quantum-cyan">
                      operator hud
                    </p>
                    <h1 className="font-display mt-1 text-2xl font-bold uppercase tracking-wider text-slate-100">
                      마이페이지
                    </h1>
                    <p className="mt-2 font-mono text-sm text-quantum-cyan">{user.login_id}</p>
                    {user.display_name ? (
                      <p className="text-sm text-slate-300">{user.display_name}</p>
                    ) : null}
                    <p className="mt-1 font-mono text-[11px] text-slate-600">
                      site_id · {user.site_id}
                    </p>
                  </div>
                  <div className="rounded-lg border border-quantum-magenta/40 bg-quantum-magenta/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-quantum-magenta">
                    elite access
                  </div>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                      total liquid balance
                    </p>
                    <p className="font-mono text-xl font-bold tabular-nums text-quantum-cyan drop-shadow-quantum">
                      {formatPlayerMoney(user.game_money_balance)}
                    </p>
                    <p className="text-[10px] text-slate-600">게임머니</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                      loyalty rolling
                    </p>
                    <p className="font-mono text-xl font-bold tabular-nums text-slate-200">
                      {formatPlayerMoney(user.rolling_point_balance)}
                    </p>
                    <p className="text-[10px] text-slate-600">포인트</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center sm:max-w-md">
                  <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-2">
                    <p className="text-[9px] uppercase text-slate-600">win rate</p>
                    <p className="font-mono text-xs text-slate-500">—</p>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-2">
                    <p className="text-[9px] uppercase text-slate-600">total bets</p>
                    <p className="font-mono text-xs text-slate-500">—</p>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-2">
                    <p className="text-[9px] uppercase text-slate-600">tier</p>
                    <p className="font-mono text-xs text-quantum-cyan">Q1</p>
                  </div>
                </div>

                <Link
                  href="/support"
                  className="mt-5 flex w-full items-center justify-between gap-3 rounded-xl border-2 border-quantum-cyan/60 bg-gradient-to-r from-quantum-cyan/15 to-slate-950/80 px-4 py-3.5 shadow-quantum-glow-lg transition hover:border-quantum-cyan hover:from-quantum-cyan/25"
                >
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-quantum-cyan">
                      1:1 문의 · 고객센터
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">
                      충전·환전·게임 문의 접수 (배팅 ID 첨부)
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Support Nexus — 여기를 누르면 문의 화면으로 이동합니다
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-lg border border-quantum-cyan/40 bg-quantum-cyan/20 px-3 py-2 text-sm font-bold text-quantum-cyan"
                    aria-hidden
                  >
                    이동
                  </span>
                </Link>
              </div>
              <div className="flex flex-wrap gap-2 px-6 py-4">
                <Link
                  href="/support"
                  className="rounded-lg border-2 border-quantum-cyan bg-quantum-cyan/20 px-4 py-2 text-sm font-bold text-quantum-cyan shadow-quantum-glow hover:bg-quantum-cyan/30"
                >
                  1:1 문의
                </Link>
                <Link
                  href="/wallet"
                  className="rounded-lg border border-quantum-cyan/40 bg-quantum-cyan/10 px-4 py-2 text-sm font-semibold text-quantum-cyan shadow-quantum-glow hover:bg-quantum-cyan/20"
                >
                  입출금
                </Link>
                <Link
                  href="/game-money"
                  className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:border-quantum-cyan/35 hover:text-quantum-cyan"
                >
                  게임머니 전환
                </Link>
                <Link
                  href="/messages"
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:border-quantum-magenta/40 hover:text-quantum-magenta"
                >
                  쪽지
                  {unread != null && unread > 0 ? (
                    <span className="ml-2 rounded-full bg-quantum-magenta/90 px-2 py-0.5 font-mono text-[11px] text-white">
                      {unread}
                    </span>
                  ) : null}
                </Link>
              </div>
            </div>
            {token ? <PlayerPasswordChangeSection token={token} /> : null}
            <PlainArticle title="안내" body={intro} />
          </>
        ) : (
          <div className="glass-panel space-y-4 p-8 text-center">
            <h1 className="font-display text-xl text-slate-100">로그인이 필요합니다</h1>
            <p className="text-sm text-slate-500">마이페이지·쪽지는 로그인 후 이용할 수 있습니다.</p>
            <button
              type="button"
              onClick={() => openLogin()}
              className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-600 px-6 py-2.5 text-sm font-medium text-white"
            >
              로그인
            </button>
          </div>
        )}

        <p className="mt-8 text-center">
          <Link href="/" className="text-sm text-quantum-cyan/90 hover:underline">
            메인으로
          </Link>
        </p>
      </main>
    </div>
  );
}
