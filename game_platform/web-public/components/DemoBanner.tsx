/**
 * 전시·데모 배포용. 빌드 시 NEXT_PUBLIC_DEMO_MODE=true 일 때만 표시.
 */
export function DemoBanner() {
  const v = process.env.NEXT_PUBLIC_DEMO_MODE?.trim().toLowerCase();
  if (v !== "true" && v !== "1" && v !== "yes") return null;

  return (
    <div
      role="status"
      className="border-b border-quantum-cyan/25 bg-gradient-to-r from-slate-950 via-slate-900/95 to-slate-950 px-3 py-2 text-center text-[11px] leading-snug text-slate-200 sm:text-xs"
    >
      <span className="rounded border border-quantum-cyan/40 bg-quantum-cyan/10 px-1.5 py-0.5 font-semibold uppercase tracking-wider text-quantum-cyan">
        DEMO
      </span>
      <span className="mx-2 hidden text-slate-600 sm:inline">|</span>
      <span className="block sm:inline">
        데모·시연용 화면입니다. 실제 서비스·정산·제휴사 연동과 다를 수 있습니다.
      </span>
    </div>
  );
}
