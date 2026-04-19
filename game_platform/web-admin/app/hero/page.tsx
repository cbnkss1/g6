import { HeroSlidesAdminPanel } from "@/components/ops/HeroSlidesAdminPanel";

export default function HeroSlidesPage() {
  return (
    <div className="quantum-shell mx-auto max-w-5xl space-y-6 px-3 py-4 sm:px-5">
      <header className="quantum-hero px-5 py-5 sm:px-7 sm:py-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-400/90">Player UI</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">메인 히어로 슬라이드</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          플레이어 홈 상단 LIVE EVENTS 영역 — 이미지·글·링크를 슬라이드로 노출합니다. (레이어 팝업과 별도)
        </p>
      </header>
      <HeroSlidesAdminPanel />
    </div>
  );
}
