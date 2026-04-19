"use client";

import Link from "next/link";

export type CentralNavItem = {
  key: string;
  label: string;
  hint: string;
  href: string | null;
  emoji: string;
};

const ITEMS: CentralNavItem[] = [
  { key: "epl", label: "EPL", hint: "프리미어리그", href: "/match-list?preset=epl", emoji: "⚽" },
  { key: "nba", label: "NBA", hint: "프로 농구", href: "/match-list?preset=nba", emoji: "🏀" },
  { key: "lck", label: "LCK", hint: "e스포츠", href: "/match-list?preset=lck", emoji: "🎮" },
  { key: "casino", label: "카지노", hint: "Live", href: "/casino", emoji: "🃏" },
  { key: "slot", label: "슬롯", hint: "Slots", href: "/slot", emoji: "🎰" },
  { key: "mini", label: "미니게임", hint: "파워볼", href: "/powerball", emoji: "🎯" },
  { key: "sports", label: "스포츠 전체", hint: "통합", href: "/match-list", emoji: "📊" },
  { key: "wallet", label: "입출금", hint: "Wallet", href: "/wallet", emoji: "💳" },
];

function Card({ item }: { item: CentralNavItem }) {
  const cls =
    "group relative flex min-h-[108px] flex-col justify-between overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.05] to-transparent p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-cyan-400/35 hover:shadow-[0_0_32px_rgba(34,211,238,0.12)] sm:min-h-[120px]";

  const shine =
    "pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-cyan-400/20 to-amber-400/10 opacity-0 blur-2xl transition group-hover:opacity-100";

  const inner = (
    <>
      <span className="text-2xl drop-shadow-md transition group-hover:scale-110 sm:text-3xl">{item.emoji}</span>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">{item.hint}</p>
        <p className="mt-1 font-display text-lg font-semibold text-white sm:text-xl">{item.label}</p>
      </div>
      <span className={shine} />
    </>
  );

  if (item.href) {
    return (
      <Link href={item.href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={`${cls} cursor-not-allowed opacity-70`} onClick={() => window.alert("준비 중입니다.")}>
      {inner}
    </button>
  );
}

export function CentralNav() {
  return (
    <section className="mt-6 sm:mt-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-400/80">Central Hub</p>
          <h2 className="font-display text-xl font-semibold text-white sm:text-2xl">주요 카테고리</h2>
        </div>
        <p className="max-w-md text-[11px] text-slate-500 sm:text-xs">
          사이드바 없이 한 화면에서 이동합니다. 리그·게임 종목은 배당판과 연동됩니다.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {ITEMS.map((item) => (
          <Card key={item.key} item={item} />
        ))}
      </div>
    </section>
  );
}
