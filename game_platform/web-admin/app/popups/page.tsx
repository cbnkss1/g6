import { PopupsAdminPanel } from "@/components/ops/PopupsAdminPanel";

export default function PopupsPage() {
  return (
    <div className="quantum-shell mx-auto max-w-5xl space-y-6 px-3 py-4 sm:px-5">
      <header className="quantum-hero px-5 py-5 sm:px-7 sm:py-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-400/90">Player UI</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">플레이어 팝업</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          로비·플레이 화면에 노출되는 레이어 팝업을 등록·기간·기기별로 관리합니다.
        </p>
      </header>
      <PopupsAdminPanel />
    </div>
  );
}
