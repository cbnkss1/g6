"use client";

import { DashboardCards } from "@/components/admin/DashboardCards";
import { useAuthStore } from "@/store/useAuthStore";

export default function DashboardPage() {
  const totoOn = useAuthStore((s) => s.site?.is_toto_enabled === true);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-400">
        집계는 본인·내 조직(하향) 기준입니다. WebSocket + React Query로 갱신됩니다.
        {totoOn ? " 토토·스포츠 모듈이 활성화된 사이트입니다." : null}
      </p>
      <DashboardCards />
      <section className="table-scroll rounded-xl border border-slate-800 bg-slate-900/50">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
            <tr>
              <th className="p-3">항목</th>
              <th className="p-3">값</th>
              <th className="hidden p-3 sm:table-cell">비고</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-800/80">
              <td className="p-3">API 베이스</td>
              <td className="p-3 font-mono text-xs text-cyan-400/90">
                /gp-api 또는 전체 URL
              </td>
              <td className="hidden p-3 text-slate-500 sm:table-cell">
                .env.local · example.env.local 참고
              </td>
            </tr>
          </tbody>
        </table>
      </section>
      <div className="grid gap-3 sm:hidden">
        <article className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-500">API 베이스</p>
          <p className="mt-1 font-mono text-sm text-cyan-400">publicApiBase()</p>
        </article>
      </div>
    </div>
  );
}
