import { SupportTicketDashboard } from "@/components/admin/SupportTicketDashboard";

export default function SupportPage() {
  return (
    <div className="quantum-shell mx-auto max-w-[1440px] space-y-6 px-3 py-4 sm:px-5">
      <header className="quantum-hero px-5 py-5 sm:px-7 sm:py-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/90">Support</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">고객센터 · 1:1 문의</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          플레이어가 제출한 문의를 확인하고 답변합니다. 목록은 자동으로 갱신됩니다.
        </p>
      </header>
      <SupportTicketDashboard />
    </div>
  );
}
