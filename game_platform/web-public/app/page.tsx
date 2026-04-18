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

const SIDEBAR_INFO_LINKS = [
  { label: "마이페이지", href: "/mypage" as const },
  { label: "이벤트", href: "/events" as const },
  { label: "고객센터", href: "/support" as const },
  { label: "FAQ", href: "/faq" as const },
  { label: "이용규정", href: "/terms" as const },
  { label: "도메인 안내", href: "/domain" as const },
] as const;

const sectionTitle = "mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-quantum-cyan";

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
      <span className="ml-2 text-[10px] font-mono text-slate-500">{hint}</span>
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
    "group flex min-h-[92px] flex-col items-start rounded-xl border border-quantum-cyan/15 bg-gradient-to-br from-slate-900/80 to-slate-950/90 p-4 text-left shadow-sm transition hover:border-quantum-cyan/45 hover:shadow-quantum-glow";
  if (href) {
    return (
      <Link href={href} className={cls}>
        <span className="text-[10px] font-mono text-quantum-cyan/70">{hint}</span>
        <span className="mt-1 font-medium text-slate-100 group-hover:text-quantum-cyan">{label}</span>
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={() => window.alert("준비 중입니다.")}>
      <span className="text-[10px] font-mono text-slate-600">{hint}</span>
      <span className="mt-1 font-medium text-slate-300">{label}</span>
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
            <p className={sectionTitle}>게임</p>
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
            <p className={sectionTitle}>안내</p>
            <nav className="flex flex-col gap-0.5">
              {SIDEBAR_INFO_LINKS.map((item) => (
                <Link key={item.href} href={item.href} className="nav-pill block w-full text-left">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-8">
          <section className="glass-panel overflow-hidden shadow-quantum-glow-lg">
            <div className="relative border-b border-quantum-cyan/10 bg-gradient-to-br from-quantum-cyan/10 via-slate-950/80 to-quantum-magenta/10 px-5 py-10 sm:px-8 sm:py-14">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.12]"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, transparent 0%, rgba(138,235,255,0.15) 50%, transparent 100%)",
                  backgroundSize: "200% 100%",
                }}
              />
              <p className="relative text-[10px] font-bold uppercase tracking-[0.4em] text-quantum-magenta/90">
                Quantum Operations Grid
              </p>
              <h1 className="relative mt-3 bg-gradient-to-r from-quantum-cyan via-white to-quantum-magenta bg-clip-text font-display text-3xl font-semibold text-transparent drop-shadow-quantum sm:text-4xl md:text-5xl">
                스포츠 · 파워볼 플레이 가능
              </h1>
              <p className="relative mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
                사이드 메뉴 또는 아래 카드에서{" "}
                <strong className="text-quantum-cyan/90">스포츠</strong>·
                <strong className="text-quantum-magenta/90">파워볼</strong>으로 이동해 베팅할 수 있습니다.{" "}
                <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
                  로그인 필요
                </span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-4">
              {GAME_LINKS.map((g) => (
                <GameCard key={g.label} label={g.label} hint={g.hint} href={g.href} />
              ))}
            </div>
            <p className="border-t border-quantum-cyan/10 px-5 py-3 text-center text-[11px] text-slate-500 sm:px-8">
              카드 톤은 의도된 Quantum 다크 UI입니다.{" "}
              <strong className="text-quantum-cyan/80">라이브카지노</strong>에서 실제 게임 목록을 불러옵니다.
            </p>
          </section>

          <section className="glass-panel p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <h2 className="bg-gradient-to-r from-quantum-cyan to-quantum-magenta bg-clip-text font-display text-xl font-semibold text-transparent">
                카지노
              </h2>
              <div className="flex gap-2 text-xs">
                <span className="rounded-full border border-quantum-cyan/40 bg-quantum-cyan/15 px-2.5 py-1 font-medium text-quantum-cyan shadow-quantum-glow">
                  인기
                </span>
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-slate-500">
                  추천
                </span>
                <span className="rounded-full border border-quantum-magenta/30 bg-quantum-magenta/10 px-2.5 py-1 text-quantum-magenta/90">
                  신상
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Link
                  key={i}
                  href="/casino"
                  className="group flex aspect-[4/5] flex-col rounded-xl border border-quantum-cyan/15 bg-gradient-to-b from-slate-900/90 to-slate-950/95 p-3 transition hover:border-quantum-cyan/40 hover:shadow-quantum-glow"
                >
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-quantum-cyan/10 bg-black/30">
                    <span className="text-3xl opacity-90 transition group-hover:scale-110 group-hover:drop-shadow-quantum">
                      🃏
                    </span>
                    <span className="text-[10px] font-medium uppercase tracking-widest text-quantum-cyan/70">
                      Live
                    </span>
                  </div>
                  <p className="mt-2 text-center text-[11px] font-medium text-slate-400 group-hover:text-quantum-cyan">
                    라이브카지노로 이동
                  </p>
                </Link>
              ))}
            </div>
            <div className="mt-4 flex justify-center gap-3">
              <Link
                href="/casino"
                className="rounded-lg border border-quantum-cyan/45 bg-quantum-cyan/15 px-4 py-2 text-sm font-semibold text-quantum-cyan shadow-quantum-glow transition hover:bg-quantum-cyan/25"
              >
                라이브카지노
              </Link>
              <Link
                href="/slot"
                className="rounded-lg border border-quantum-magenta/35 bg-quantum-magenta/10 px-4 py-2 text-sm font-semibold text-quantum-magenta transition hover:border-quantum-magenta/50 hover:bg-quantum-magenta/15"
              >
                슬롯게임
              </Link>
            </div>
          </section>

          <section className="sm:hidden">
            <p className={sectionTitle}>메뉴</p>
            <div className="glass-panel flex flex-col divide-y divide-quantum-cyan/10">
              {GAME_LINKS.map((g) =>
                g.href ? (
                  <Link
                    key={g.label}
                    href={g.href}
                    className="px-4 py-3 text-left text-sm text-slate-300 hover:bg-quantum-cyan/5 hover:text-quantum-cyan"
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
              {SIDEBAR_INFO_LINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-4 py-3 text-left text-sm text-slate-300 hover:bg-quantum-cyan/5 hover:text-quantum-cyan"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </section>
        </main>
      </div>

      <footer className="mt-auto border-t border-quantum-cyan/15 py-6 text-center text-[11px] text-slate-500">
        <span className="text-quantum-cyan/70">© SLOTPASS</span>
        <span className="mx-2 text-slate-600">·</span>
        <span className="text-quantum-magenta/70">Quantum Player</span>
      </footer>
    </div>
  );
}
