"use client";

import { useQuery } from "@tanstack/react-query";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type Line = {
  ledger_id: number;
  credited_at: string;
  referrer_login_id: string;
  player_login_id: string;
  game_type: string;
  bet_id: number;
  total_bet: string;
  valid_bet: string;
  configured_rate_percent: string;
  rolling_paid: string;
  implied_rate_percent: string;
  game_result: string;
};

type ApiResponse = {
  day_start_utc: string;
  lines: Line[];
  totals: {
    total_bet_sum: string;
    valid_bet_sum: string;
    rolling_paid_sum: string;
  };
};

export default function SettlementsPage() {
  const token = useAuthStore((s) => s.token);

  const q = useQuery({
    queryKey: ["admin", "settlements", "rolling-lines", token ?? ""],
    queryFn: async () => {
      const base = publicApiBase();
      if (!base || !token) throw new Error("missing env or token");
      const r = await fetch(
        `${base}/admin/settlements/rolling-lines`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      if (!r.ok) throw new Error(`settlements ${r.status}`);
      return (await r.json()) as ApiResponse;
    },
    enabled: Boolean(token),
    refetchInterval: 60_000,
  });

  if (q.isLoading) {
    return <p className="text-sm text-slate-500">불러오는 중…</p>;
  }
  if (q.isError) {
    return (
      <p className="text-sm text-red-400">
        정산 내역을 불러오지 못했습니다. 로그인·API URL을 확인하세요.
      </p>
    );
  }

  const data = q.data;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">팀 롤링 정산 내역</h2>
        <p className="mt-1 text-sm text-slate-500">
          집계 기준일(UTC) 시작:{" "}
          <span className="font-mono text-premium">{data.day_start_utc}</span>
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          <span className="text-premium-glow font-medium">유효 배팅</span>은 승·패(
          <code className="text-slate-400">WIN</code>/
          <code className="text-slate-400">LOSE</code>)만 포함합니다. 타이·취소·적특 등은
          롤링 0원이며 본 표에는 지급이 발생한 라인만 표시됩니다.
        </p>
        <p className="mt-1 text-xs text-slate-600">
          공식:{" "}
          <span className="rounded border border-premium/30 bg-premium/5 px-1.5 py-0.5 text-premium">
            유효 배팅 × 적용 요율(%) ÷ 100 ≈ 지급 롤링(P)
          </span>
          · 역산 요율은 실제 지급액÷유효배팅으로 검증용입니다.
        </p>
      </div>

      <div className="table-scroll rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="w-full min-w-[920px] text-left text-sm text-slate-300">
          <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
            <tr>
              <th className="p-3">지급 시각(UTC)</th>
              <th className="p-3">롤링 수령</th>
              <th className="p-3">플레이어</th>
              <th className="p-3">게임</th>
              <th className="p-3 text-right">총 배팅</th>
              <th className="p-3 text-right text-premium">유효 배팅</th>
              <th className="p-3 text-right">요율 %</th>
              <th className="p-3 text-right">지급 롤링</th>
              <th className="p-3 text-right">역산 %</th>
              <th className="p-3">결과</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-6 text-center text-slate-500">
                  오늘 지급된 롤링 내역이 없습니다.
                </td>
              </tr>
            ) : (
              data.lines.map((row) => (
                <tr
                  key={row.ledger_id}
                  className="border-b border-slate-800/70 hover:bg-slate-800/30"
                >
                  <td className="p-3 font-mono text-xs text-slate-400">
                    {row.credited_at}
                  </td>
                  <td className="p-3">{row.referrer_login_id}</td>
                  <td className="p-3">{row.player_login_id}</td>
                  <td className="p-3">{row.game_type}</td>
                  <td className="p-3 text-right tabular-nums">{row.total_bet}</td>
                  <td className="p-3 text-right tabular-nums font-medium text-premium-glow">
                    {row.valid_bet}
                  </td>
                  <td className="p-3 text-right tabular-nums">{row.configured_rate_percent}</td>
                  <td className="p-3 text-right tabular-nums text-emerald-300/90">
                    {row.rolling_paid}
                  </td>
                  <td className="p-3 text-right tabular-nums text-slate-500">
                    {row.implied_rate_percent}
                  </td>
                  <td className="p-3 font-mono text-xs">{row.game_result}</td>
                </tr>
              ))
            )}
          </tbody>
          {data.lines.length > 0 && (
            <tfoot className="border-t border-premium/20 bg-slate-950/80 text-sm font-semibold">
              <tr>
                <td colSpan={4} className="p-3 text-slate-400">
                  합계
                </td>
                <td className="p-3 text-right tabular-nums">{data.totals.total_bet_sum}</td>
                <td className="p-3 text-right tabular-nums text-premium">
                  {data.totals.valid_bet_sum}
                </td>
                <td className="p-3" />
                <td className="p-3 text-right tabular-nums text-emerald-300">
                  {data.totals.rolling_paid_sum}
                </td>
                <td colSpan={2} className="p-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
