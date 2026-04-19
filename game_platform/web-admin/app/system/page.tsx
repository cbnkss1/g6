import Link from "next/link";

export default function SystemPage() {
  return (
    <div className="quantum-shell mx-auto max-w-3xl space-y-8 px-3 py-4 sm:px-5">
      <header className="quantum-hero px-5 py-5 sm:px-7 sm:py-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">System</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">시스템</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          쪽지·팝업·1:1 문의는 왼쪽 메뉴 <strong className="text-slate-300">운영 · 연락</strong>에서 관리합니다.
        </p>
      </header>

      <div className="quantum-card divide-y divide-slate-600/30 p-0">
        <Link
          href="/messages"
          className="flex items-center justify-between px-5 py-4 text-sm text-slate-200 transition hover:bg-slate-800/40"
        >
          <span>쪽지 발송</span>
          <span className="text-slate-500">→</span>
        </Link>
        <Link
          href="/popups"
          className="flex items-center justify-between px-5 py-4 text-sm text-slate-200 transition hover:bg-slate-800/40"
        >
          <span>플레이어 팝업</span>
          <span className="text-slate-500">→</span>
        </Link>
        <Link
          href="/support"
          className="flex items-center justify-between px-5 py-4 text-sm text-slate-200 transition hover:bg-slate-800/40"
        >
          <span>고객센터 (1:1)</span>
          <span className="text-slate-500">→</span>
        </Link>
        <Link
          href="/audit"
          className="flex items-center justify-between px-5 py-4 text-sm text-slate-200 transition hover:bg-slate-800/40"
        >
          <span>감사 로그</span>
          <span className="text-slate-500">→</span>
        </Link>
      </div>
    </div>
  );
}
