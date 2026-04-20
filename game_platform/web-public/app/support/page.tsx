"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { PlayerSupportCyberForm } from "@/components/support/PlayerSupportCyberForm";
import { PlainArticle } from "@/components/PlainArticle";
import { SiteHeader } from "@/components/SiteHeader";
import { usePlayerAuth } from "@/lib/playerAuthContext";
import { fetchPlayerPublicPages } from "@/lib/playerPortal";
import { playerSupportIsExternal, playerSupportUrl } from "@/lib/playerExternalLinks";

export default function SupportPage() {
  const { user, token, openLogin } = usePlayerAuth();
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const extUrl = playerSupportUrl();
  const extTab = playerSupportIsExternal();

  useEffect(() => {
    let cancel = false;
    (async () => {
      setErr(null);
      try {
        const d = await fetchPlayerPublicPages(user?.site_id ?? null);
        if (!cancel) setBody(d.pages.support);
      } catch (e) {
        if (!cancel) setErr(e instanceof Error ? e.message : "로드 실패");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [user?.site_id]);

  return (
    <div className="relative min-h-screen">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(0,229,255,0.2), transparent 42%), radial-gradient(circle at 80% 10%, rgba(255,0,229,0.08), transparent 38%)",
        }}
      />
      <SiteHeader />
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        {err ? (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {err}
          </p>
        ) : null}

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="glass-panel rounded-2xl p-5 md:col-span-2">
            <h1 className="bg-gradient-to-r from-quantum-cyan via-white to-quantum-magenta bg-clip-text text-2xl font-bold uppercase tracking-wide text-transparent">
              Support Nexus
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              충전·환전·게임·이벤트 문의를 카테고리로 접수하고, 최근 배팅 ID를 즉시 첨부할 수 있습니다.
            </p>
          </div>
          <div className="glass-panel rounded-2xl border-quantum-magenta/25 bg-gradient-to-br from-quantum-magenta/10 to-transparent p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-quantum-magenta/90">
              Quick Link
            </p>
            <div className="mt-3 flex flex-col gap-2.5 text-sm">
              <Link
                href="/messages"
                className="group relative overflow-hidden rounded-xl border border-amber-400/45 bg-gradient-to-br from-amber-500/[0.18] via-amber-600/[0.08] to-rose-900/20 px-4 py-3 text-center font-semibold text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_36px_rgba(245,158,11,0.18)] transition hover:border-amber-300/60 hover:shadow-[0_0_40px_rgba(251,191,36,0.22)]"
              >
                <span className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-amber-400/20 blur-2xl transition group-hover:bg-amber-300/25" />
                <span className="relative flex flex-col items-center gap-1">
                  <span className="flex items-center gap-2 text-[15px] tracking-tight">
                    <svg
                      className="h-5 w-5 text-amber-200/95"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.6}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    쪽지함
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-amber-200/75">
                    관리자 알림 · 공지
                  </span>
                </span>
              </Link>
              <Link
                href="/wallet"
                className="rounded-lg border border-quantum-cyan/35 bg-quantum-cyan/10 px-3 py-2 text-center text-quantum-cyan hover:bg-quantum-cyan/20"
              >
                입출금 · 지갑
              </Link>
              {extTab && extUrl ? (
                <a
                  href={extUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-slate-600 px-3 py-2 text-center text-slate-300 hover:border-quantum-cyan/45"
                >
                  외부 고객센터
                </a>
              ) : null}
            </div>
          </div>
        </div>

        {token ? (
          <PlayerSupportCyberForm token={token} />
        ) : (
          <div className="glass-panel rounded-2xl p-8 text-center shadow-quantum-glow-lg">
            <p className="text-slate-300">1:1 문의를 작성하려면 로그인이 필요합니다.</p>
            <button
              type="button"
              onClick={() => openLogin()}
              className="mt-4 rounded-xl border border-quantum-cyan/50 bg-quantum-cyan/15 px-6 py-2.5 text-sm font-semibold text-quantum-cyan shadow-quantum-glow hover:bg-quantum-cyan/25"
            >
              로그인
            </button>
          </div>
        )}

        {body ? (
          <div className="mt-10 rounded-2xl border border-slate-700/60 bg-slate-900/40 p-6">
            <PlainArticle title="안내" body={body} />
          </div>
        ) : null}

        <p className="mt-10 text-center">
          <Link href="/" className="text-sm text-quantum-cyan/90 hover:underline">
            메인으로
          </Link>
        </p>
      </main>
    </div>
  );
}
