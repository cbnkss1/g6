"use client";

const DEFAULT_LINES = [
  "a***님 · 입금 300,000원 승인",
  "b***님 · 파워볼 당첨 1,240,000원",
  "c***님 · 출금 요청 접수",
  "d***님 · EPL 홈승 적중 520,000원",
  "e***님 · 카지노 롤링 포인트 적립",
  "f***님 · 입금 1,000,000원 승인",
  "g***님 · NBA 스프레드 당첨 890,000원",
];

export function WinTicker() {
  const doubled = [...DEFAULT_LINES, ...DEFAULT_LINES];

  return (
    <div
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 h-9 overflow-hidden border-t border-white/[0.07] bg-[#0a0a0a]/95 backdrop-blur-md"
      aria-hidden
    >
      <div className="flex h-full items-center">
        <span className="shrink-0 border-r border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/90">
          Live
        </span>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="flex w-max animate-home-marquee gap-12 pr-12 text-[11px] text-slate-400">
            {doubled.map((line, i) => (
              <span key={`${line}-${i}`} className="whitespace-nowrap">
                <span className="text-cyan-500/80">●</span> {line}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
