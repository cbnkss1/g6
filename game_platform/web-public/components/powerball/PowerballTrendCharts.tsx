"use client";

import { useMemo } from "react";

import type { PowerballOverview } from "@/lib/playerGamesApi";

export type PowerballRoundRow = PowerballOverview["recent_rounds"][number];

type Props = {
  rounds: PowerballRoundRow[];
  /** 최신 쪽 N회만 사용 (API는 보통 최신순) */
  limit?: number;
};

/** 시간순(오래된 것 → 최신)으로 정렬 */
function chronological(rows: PowerballRoundRow[], cap: number): PowerballRoundRow[] {
  const sorted = [...rows].sort((a, b) => Number(a.round_no) - Number(b.round_no));
  if (sorted.length <= cap) return sorted;
  return sorted.slice(-cap);
}

export function PowerballTrendCharts({ rounds, limit = 100 }: Props) {
  const series = useMemo(() => chronological(rounds, limit), [rounds, limit]);

  const chart = useMemo(() => {
    const W = 720;
    const H = 160;
    const pad = 8;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;
    const n = series.length;
    if (!n) {
      return { W, H, sumLine: "", pbLine: "", sumDots: [] as JSX.Element[], pbDots: [] as JSX.Element[] };
    }
    const sums = series.map((r) => (r.sum != null && Number.isFinite(Number(r.sum)) ? Number(r.sum) : null));
    const pbs = series.map((r) => (r.pb != null && Number.isFinite(Number(r.pb)) ? Number(r.pb) : null));
    const validSum = sums.filter((x): x is number => x != null);
    const minS = validSum.length ? Math.min(...validSum, 65) : 65;
    const maxS = validSum.length ? Math.max(...validSum, 155) : 155;
    const sx = (i: number) => pad + innerW * (n === 1 ? 0.5 : i / (n - 1));
    const sySum = (v: number) => {
      const t = (v - minS) / (maxS - minS || 1);
      return pad + innerH * (1 - Math.min(1, Math.max(0, t)));
    };
    const syPb = (v: number) => pad + innerH * (1 - Math.min(1, Math.max(0, v / 9)));
    const sumLineArr: string[] = [];
    const sumDots: JSX.Element[] = [];
    const pbLineArr: string[] = [];
    const pbDots: JSX.Element[] = [];
    for (let i = 0; i < n; i++) {
      const x = sx(i);
      if (sums[i] != null) {
        sumLineArr.push(`${x},${sySum(sums[i]!)}`);
        sumDots.push(
          <circle key={`s-${series[i].round_no}`} cx={x} cy={sySum(sums[i]!)} r={2.2} fill="#fbbf24" />,
        );
      }
      if (pbs[i] != null) {
        pbLineArr.push(`${x},${syPb(pbs[i]!)}`);
        pbDots.push(
          <circle key={`p-${series[i].round_no}`} cx={x} cy={syPb(pbs[i]!)} r={2} fill="#38bdf8" />,
        );
      }
    }
    return {
      W,
      H,
      sumLine: sumLineArr.join(" "),
      pbLine: pbLineArr.join(" "),
      sumDots,
      pbDots,
    };
  }, [series]);

  const chineseDots = useMemo(() => {
    return series.map((r, i) => {
      const pb = r.pb;
      const odd = pb != null && Number.isFinite(Number(pb)) && Number(pb) % 2 === 1;
      const empty = pb == null || !Number.isFinite(Number(pb));
      return (
        <span
          key={`${r.round_no}-${i}`}
          title={`#${r.round_no} PB=${pb ?? "—"}`}
          className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full ${
            empty ? "bg-slate-800" : odd ? "bg-sky-500" : "bg-rose-500"
          }`}
        />
      );
    });
  }, [series]);

  if (!rounds.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#121820]/80 px-4 py-6 text-center text-sm text-slate-500">
        최근 회차가 쌓이면 그래프·중국줄이 표시됩니다.
      </div>
    );
  }

  const oldest = series[0]?.round_no;
  const newest = series[series.length - 1]?.round_no;

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-gradient-to-b from-[#121820] to-[#0d1218] p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          일반볼 합계 · 파워볼 번호 (시간순 {series.length}회)
        </h3>
        <p className="font-mono text-[10px] text-slate-600">
          회차 #{oldest} → #{newest}
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#0a0e14] p-2">
        <svg
          width="100%"
          height={chart.H}
          viewBox={`0 0 ${chart.W} ${chart.H}`}
          className="min-w-[320px] text-slate-500"
          preserveAspectRatio="none"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <line
              key={t}
              x1="8"
              x2={chart.W - 8}
              y1={8 + (chart.H - 16) * t}
              y2={8 + (chart.H - 16) * t}
              stroke="rgba(148,163,184,0.12)"
              strokeWidth="1"
            />
          ))}
          {chart.sumLine ? (
            <polyline
              fill="none"
              stroke="#fbbf24"
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={chart.sumLine}
            />
          ) : null}
          {chart.pbLine ? (
            <polyline
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.2"
              strokeDasharray="4 3"
              strokeLinejoin="round"
              points={chart.pbLine}
            />
          ) : null}
          {chart.sumDots}
          {chart.pbDots}
        </svg>
        <div className="mt-2 flex flex-wrap gap-4 text-[10px] text-slate-500">
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />
            일반볼 합
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400" />
            파워 숫자(0–9)
          </span>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          파워볼 홀짝 중국줄 (최근 {Math.min(limit, series.length)}회, 왼쪽→오래된 회차)
        </h3>
        <div className="flex max-h-24 flex-wrap content-start gap-[3px] overflow-y-auto rounded-lg border border-white/10 bg-[#0a0e14] p-2">
          {chineseDots}
        </div>
        <p className="mt-1.5 text-[10px] text-slate-600">파랑=홀, 빨강=짝, 회색=값 없음</p>
      </div>
    </div>
  );
}
