import { MessagesAdminPanel } from "@/components/ops/MessagesAdminPanel";

export default function MessagesPage() {
  return (
    <div className="quantum-shell mx-auto max-w-4xl space-y-6 px-3 py-4 sm:px-5">
      <header className="quantum-hero px-5 py-5 sm:px-7 sm:py-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-400/90">Operations</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">쪽지 발송</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          개별 회원 또는 사이트 전체 플레이어에게 알림 쪽지를 보냅니다. 발송 기록은 본인 기준으로만 표시됩니다.
        </p>
      </header>
      <MessagesAdminPanel />
    </div>
  );
}
