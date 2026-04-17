"use client";

import Link from "next/link";

import { SiteHeader } from "@/components/SiteHeader";

const GAME_LINKS = [
  { label: "입출금", hint: "WALLET", href: "/wallet" as string | null },
  { label: "카지노", hint: "LIVE", href: "/casino" as string | null },
  { label: "슬롯", hint: "SLOT", href: "/slot" },
  { label: "스포츠", hint: "SPORTS", href: "/match-list" },
  { label: "스포츠북", hint: "BOOK", href: null },
  { label: "미니게임", hint: "MINI", href: "/powerball" },
  { label: "파워볼", hint: "POWER", href: "/powerball" },
  { label: "브랜드 게임", hint: "BRAND", href: null },
] as const;

const SIDEBAR_GENERAL = [
  "마이페이지",
  "이벤트",
  "고객센터",
  "FAQ",
  "이용규정",
  "도메인 안내",
] as const;

function GameNavRow({
  label,
  hint,
  href,
  className,
}: {
  label: string;
  hint: string;
  href: string | null;
  className: string;
}) {
  const inner = (
    <>
      <span className="font-medium">{label}</span>
      <span className="ml-2 text-[10px] text-slate-600">{hint}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.alert("준비 중입니다.")}
    >
      {inner}
    </button>
  );
}

function GameCard({
  label,
  hint,
  href,
}: {
  label: string;
  hint: string;
  href: string | null;
}) {
  const cls =
    "flex flex-col items-start rounded-xl border border-white/10 bg-slate-900/60 p-4 text-left shadow-sm transition hover:border-premium/30 hover:bg-slate-900/80 hover:shadow-premium min-h-[88px]";
  if (href) {
    return (
      <Link href={href} className={cls}>
        <span className="text-[10px] font-mono text-slate-600">{hint}</span>
        <span className="mt-1 font-medium text-slate-200">{label}</span>
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={() => window.alert("준비 중입니다.")}>
      <span className="text-[10px] font-mono text-slate-600">{hint}</span>
      <span className="mt-1 font-medium text-slate-200">{label}</span>
    </button>
  );
}

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 py-6 sm:flex-row sm:px-6">
        <aside className="glass-panel hidden w-56 shrink-0 flex-col gap-6 p-4 sm:flex lg:w-64">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-premium">
              게임
            </p>
            <nav className="flex flex-col gap-0.5">
              {GAME_LINKS.map((g) => (
                <GameNavRow
                  key={g.label}
                  label={g.label}
                  hint={g.hint}
                  href={g.href}
                  className="nav-pill block w-full text-left"
                />
              ))}
            </nav>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-premium">
              안내
            </p>
            <nav className="flex flex-col gap-0.5">
              {SIDEBAR_GENERAL.map((t) => (
                <button key={t} type="button" className="nav-pill">
                  {t}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-8">
          <section className="glass-panel overflow-hidden">
            <div className="border-b border-white/5 px-5 py-10 sm:px-8 sm:py-14">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-premium">
                메인 배너 영역
              </p>
              <h1 className="font-display mt-2 text-3xl font-semibold text-slate-100 sm:text-4xl">
                스포츠 · 파워볼 플레이 가능
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-500">
                사이드 메뉴 또는 아래 카드에서 <strong className="text-slate-400">스포츠</strong>·
                <strong className="text-slate-400">파워볼</strong>으로 이동해 베팅할 수 있습니다. (로그인
                필요)
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-4">
              {GAME_LINKS.map((g) => (
                <GameCard key={g.label} label={g.label} hint={g.hint} href={g.href} />
              ))}
            </div>
            <p className="border-t border-white/5 px-5 py-3 text-center text-[11px] text-slate-600 sm:px-8">
              카드가 어둡게 보여도 오류가 아닙니다. 아래 <strong className="text-slate-500">라이브카지노</strong>에서
              실제 게임 목록을 불러옵니다.
            </p>
          </section>

          <section className="glass-panel p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <h2 className="font-display text-xl text-slate-100">카지노</h2>
              <div className="flex gap-2 text-xs">
                <span className="rounded-full border border-premium/30 bg-premium/10 px-2.5 py-1 text-premium-glow">
                  인기
                </span>
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-slate-500">
                  추천
                </span>
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-slate-500">
                  전체
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Link
                  key={i}
                  href="/casino"
                  className="group flex aspect-[4/5] flex-col rounded-xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/95 p-3 transition hover:border-premium/35 hover:shadow-[0_0_24px_rgba(212,175,55,0.12)]"
                >
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-white/5 bg-black/25">
                    <span className="text-3xl opacity-80 transition group-hover:scale-110 group-hover:opacity-100">
                      🃏
                    </span>
                    <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                      Live
                    </span>
                  </div>
                  <p className="mt-2 text-center text-[11px] font-medium text-slate-400 group-hover:text-premium-glow">
                    라이브카지노로 이동
                  </p>
                </Link>
              ))}
            </div>
            <div className="mt-3 flex justify-center gap-3">
              <Link href="/casino" className="rounded-lg border border-premium/30 bg-premium/10 px-4 py-2 text-sm font-semibold text-premium-glow hover:bg-premium/20 transition">
                🎰 라이브카지노
              </Link>
              <Link href="/slot" className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-premium/30 hover:text-premium-glow transition">
                🎮 슬롯게임
              </Link>
            </div>
          </section>

          <section className="sm:hidden">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-premium">
              메뉴
            </p>
            <div className="glass-panel flex flex-col divide-y divide-white/5">
              {GAME_LINKS.map((g) =>
                g.href ? (
                  <Link
                    key={g.label}
                    href={g.href}
                    className="px-4 py-3 text-left text-sm text-slate-300 hover:bg-white/5"
                  >
                    {g.label}
                  </Link>
                ) : (
                  <button
                    key={g.label}
                    type="button"
                    className="px-4 py-3 text-left text-sm text-slate-300 hover:bg-white/5"
                    onClick={() => window.alert("준비 중입니다.")}
                  >
                    {g.label}
                  </button>
                ),
              )}
              {SIDEBAR_GENERAL.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="px-4 py-3 text-left text-sm text-slate-300 hover:bg-white/5"
                >
                  {t}
                </button>
              ))}
            </div>
          </section>
        </main>
      </div>

      <footer className="mt-auto border-t border-white/5 py-6 text-center text-[11px] text-slate-600">
        © SLOTPASS · 플레이어
      </footer>
    </div>
  );
}
