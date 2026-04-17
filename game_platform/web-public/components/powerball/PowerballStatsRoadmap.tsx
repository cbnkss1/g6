"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { PowerballOverview } from "@/lib/playerGamesApi";

export type PowerballRoundRow = PowerballOverview["recent_rounds"][number];

type Pattern = "sum_oe" | "sum_uo" | "pb_oe" | "pb_uo";

function valSumOE(sum: number | null | undefined): "L" | "R" {
  if (sum == null || !Number.isFinite(Number(sum))) return "L";
  return Number(sum) % 2 === 1 ? "L" : "R";
}
function valSumUO(sum: number | null | undefined): "L" | "R" {
  if (sum == null || !Number.isFinite(Number(sum))) return "L";
  return Number(sum) <= 72 ? "L" : "R";
}
function valPbOE(pb: number | null | undefined): "L" | "R" {
  if (pb == null || !Number.isFinite(Number(pb))) return "L";
  return Number(pb) % 2 === 1 ? "L" : "R";
}
function valPbUO(pb: number | null | undefined): "L" | "R" {
  if (pb == null || !Number.isFinite(Number(pb))) return "L";
  return Number(pb) <= 4 ? "L" : "R";
}

function valueFor(r: PowerballRoundRow, p: Pattern): "L" | "R" {
  switch (p) {
    case "sum_oe":
      return valSumOE(r.sum);
    case "sum_uo":
      return valSumUO(r.sum);
    case "pb_oe":
      return valPbOE(r.pb);
    case "pb_uo":
      return valPbUO(r.pb);
    default:
      return "L";
  }
}

function patternMeta(p: Pattern): { left: string; right: string; shortL: string; shortR: string } {
  switch (p) {
    case "sum_oe":
      return { left: "일반 홀", right: "일반 짝", shortL: "홀", shortR: "짝" };
    case "sum_uo":
      return { left: "일반 언더", right: "일반 오버", shortL: "언", shortR: "오" };
    case "pb_oe":
      return { left: "파워 홀", right: "파워 짝", shortL: "홀", shortR: "짝" };
    case "pb_uo":
      return { left: "파워 언더", right: "파워 오버", shortL: "언", shortR: "오" };
  }
}

function sizeBucket(sum: number | null | undefined): "s" | "m" | "l" {
  if (sum == null || !Number.isFinite(Number(sum))) return "m";
  const v = Number(sum);
  if (v <= 72) return "s";
  if (v <= 80) return "m";
  return "l";
}

function padColumnToSix(col: ("L" | "R")[]): (("L" | "R") | null)[] {
  const tail = col.length > 6 ? col.slice(-6) : col.slice();
  const out: (("L" | "R") | null)[] = [];
  for (let i = 0; i < 6 - tail.length; i++) out.push(null);
  for (const c of tail) out.push(c);
  return out;
}

function buildRoadColumns(chrono: PowerballRoundRow[], pattern: Pattern): ("L" | "R")[][] {
  const cols: ("L" | "R")[][] = [];
  let cur: ("L" | "R")[] = [];
  let last: "L" | "R" | null = null;
  for (const r of chrono) {
    const v = valueFor(r, pattern);
    if (last === null || v === last) {
      cur.push(v);
    } else {
      if (cur.length) cols.push(cur);
      cur = [v];
    }
    last = v;
  }
  if (cur.length) cols.push(cur);
  return cols;
}

function endStreakLen(chrono: PowerballRoundRow[], pattern: Pattern): { side: "L" | "R"; len: number } | null {
  if (!chrono.length) return null;
  const last = valueFor(chrono[chrono.length - 1], pattern);
  let n = 0;
  for (let i = chrono.length - 1; i >= 0; i--) {
    if (valueFor(chrono[i], pattern) !== last) break;
    n++;
  }
  return { side: last, len: n };
}

type Props = {
  rounds: PowerballRoundRow[];
  /** 통계·출줄에 쓸 최대 회차 수(시간순 꼬리). API 최대 400과 맞춤 */
  recentCap?: number;
  /**
   * 출줄에서 보이는 최대 열 수. 생략(0)이면 **전체 열** 표시(가로 스크롤).
   * 열이 매우 많을 때만 숫자로 상한을 줄이면 됩니다.
   */
  roadMaxCols?: number;
};

export function PowerballStatsRoadmap({ rounds, recentCap = 400, roadMaxCols = 0 }: Props) {
  const [pattern, setPattern] = useState<Pattern>("pb_oe");
  const [open, setOpen] = useState(true);
  const roadScrollRef = useRef<HTMLDivElement>(null);

  const chrono = useMemo(() => [...rounds].reverse(), [rounds]);
  const cap = Math.min(400, Math.max(10, recentCap));
  const sample = useMemo(() => chrono.slice(-cap), [chrono, cap]);

  const stats = useMemo(() => {
    const n = sample.length;
    if (!n) {
      return {
        n: 0,
        sumOE: [0, 0] as [number, number],
        sumUO: [0, 0] as [number, number],
        pbOE: [0, 0] as [number, number],
        pbUO: [0, 0] as [number, number],
        size: { s: 0, m: 0, l: 0 },
      };
    }
    let sumO = 0,
      sumE = 0,
      sumU = 0,
      sumO2 = 0;
    let pbO = 0,
      pbE = 0,
      pbU = 0,
      pbO2 = 0;
    const sz = { s: 0, m: 0, l: 0 };
    for (const r of sample) {
      const s = r.sum;
      const pb = r.pb;
      if (valSumOE(s) === "L") sumO++;
      else sumE++;
      if (valSumUO(s) === "L") sumU++;
      else sumO2++;
      if (valPbOE(pb) === "L") pbO++;
      else pbE++;
      if (valPbUO(pb) === "L") pbU++;
      else pbO2++;
      sz[sizeBucket(s)]++;
    }
    return {
      n,
      sumOE: [sumO, sumE] as [number, number],
      sumUO: [sumU, sumO2] as [number, number],
      pbOE: [pbO, pbE] as [number, number],
      pbUO: [pbU, pbO2] as [number, number],
      size: sz,
    };
  }, [sample]);

  const roadCols = useMemo(() => buildRoadColumns(sample, pattern), [sample, pattern]);
  const tailCols = useMemo(() => {
    if (!roadMaxCols || roadMaxCols <= 0) return roadCols;
    const lim = Math.min(400, Math.max(12, roadMaxCols));
    return roadCols.slice(-lim);
  }, [roadCols, roadMaxCols]);
  const streak = useMemo(() => endStreakLen(sample, pattern), [sample, pattern]);

  /** 새 회차가 붙을 때마다 출줄을 최신 열(오른쪽)로 스크롤 */
  useEffect(() => {
    const el = roadScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollLeft = el.scrollWidth;
    });
  }, [tailCols.length, sample.length, pattern, open]);
  const meta = patternMeta(pattern);

  const pie = useMemo(() => {
    const { s, m, l } = stats.size;
    const t = s + m + l || 1;
    const sp = (s / t) * 100;
    const mp = (m / t) * 100;
    return {
      conic: `conic-gradient(
        rgb(59 130 246) 0% ${sp}%,
        rgb(234 179 8) ${sp}% ${sp + mp}%,
        rgb(239 68 68) ${sp + mp}% 100%
      )`,
      s,
      m,
      l,
      t,
    };
  }, [stats.size]);

  if (!rounds.length) {
    return (
      <section className="rounded-xl border border-white/10 bg-[#121820]/80 px-4 py-6 text-center text-sm text-slate-500">
        최근 회차 데이터가 쌓이면 그래프·중국식 출줄이 표시됩니다.
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-[#121820] to-[#0d1218] shadow-lg">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b border-white/10 px-4 py-3 text-left transition hover:bg-white/[0.04]"
      >
        <span className="text-sm font-semibold text-slate-200">
          통계 · 중국식 출줄{" "}
          <span className="font-normal text-slate-500">(최근 {stats.n}회 기준, 최대 {cap}회)</span>
        </span>
        <span className="text-xs text-amber-400/90">{open ? "접기 ▲" : "펼치기 ▼"}</span>
      </button>
      {open ? (
        <div className="space-y-5 p-4 sm:p-5">
          {/* 막대 그래프 4종 */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <BarPair label="일반 홀·짝" a={stats.sumOE[0]} b={stats.sumOE[1]} left="홀" right="짝" />
            <BarPair label="일반 언·오" a={stats.sumUO[0]} b={stats.sumUO[1]} left="언" right="오" />
            <BarPair label="파워 홀·짝" a={stats.pbOE[0]} b={stats.pbOE[1]} left="홀" right="짝" />
            <BarPair label="파워 언·오" a={stats.pbUO[0]} b={stats.pbUO[1]} left="언" right="오" />
          </div>

          {/* 소·중·대 파이 */}
          <div className="flex flex-wrap items-center justify-center gap-6 border-y border-white/5 py-4">
            <div
              className="h-32 w-32 shrink-0 rounded-full border-4 border-white/10 shadow-inner"
              style={{ background: pie.conic }}
              title="소·중·대"
            />
            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                소 (≤72) <strong className="text-slate-200">{pie.s}</strong> (
                {((pie.s / pie.t) * 100).toFixed(1)}%)
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                중 (73–80) <strong className="text-slate-200">{pie.m}</strong> (
                {((pie.m / pie.t) * 100).toFixed(1)}%)
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                대 (≥81) <strong className="text-slate-200">{pie.l}</strong> (
                {((pie.l / pie.t) * 100).toFixed(1)}%)
              </div>
            </div>
          </div>

          {/* 패턴 탭 + 출줄 */}
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              {(
                [
                  ["pb_oe", "파워 홀짝"],
                  ["pb_uo", "파워 언오"],
                  ["sum_oe", "일반 홀짝"],
                  ["sum_uo", "일반 언오"],
                ] as const
              ).map(([k, lab]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPattern(k)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    pattern === k
                      ? "bg-amber-500/90 text-slate-950"
                      : "border border-white/10 text-slate-400 hover:border-amber-500/40"
                  }`}
                >
                  {lab}
                </button>
              ))}
            </div>
            {streak ? (
              <p className="mb-2 text-center text-[11px] text-slate-500">
                마지막 추세:{" "}
                <strong className="text-amber-200/90">
                  {streak.side === "L" ? meta.left : meta.right} {streak.len}연속
                </strong>
              </p>
            ) : null}
            <div
              ref={roadScrollRef}
              className="overflow-x-auto rounded-lg border border-white/10 bg-[#e8eaef] p-2"
            >
              <div className="flex min-h-[156px] gap-px">
                {tailCols.map((col, ci) => {
                  const cells = padColumnToSix(col);
                  return (
                    <div key={ci} className="flex w-[26px] shrink-0 flex-col gap-px">
                      {cells.map((cell, ri) => (
                        <div
                          key={ri}
                          className="flex h-[26px] w-[26px] items-center justify-center rounded-sm border border-slate-300/80 bg-white/90"
                        >
                          {cell ? (
                            <span
                              className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] font-bold text-white ${
                                cell === "L" ? "bg-sky-600" : "bg-rose-600"
                              }`}
                            >
                              {cell === "L" ? meta.shortL.charAt(0) : meta.shortR.charAt(0)}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-slate-500">
              같은 결과가 이어지면 세로로 쌓이고, 바뀌면 오른쪽 열로 이동합니다. (
              {roadMaxCols && roadMaxCols > 0 ? `최대 ${Math.min(400, roadMaxCols)}열` : `전체 ${tailCols.length}열`} ·
              최신 열로 자동 스크롤)
            </p>
          </div>

          {/* 원시 표 */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              최근 회차 원시
            </h3>
            <div className="max-h-[min(70vh,28rem)] overflow-auto rounded-lg border border-white/10">
              <table className="w-full border-collapse text-left text-[11px] text-slate-300">
                <thead className="sticky top-0 z-[1] border-b border-white/10 bg-[#1c2330] text-[10px] text-slate-500">
                  <tr>
                    <th className="px-2 py-2">회차</th>
                    <th className="px-1 py-2 text-right">합</th>
                    <th className="px-1 py-2 text-right">PB</th>
                    <th className="px-1 py-2">일반</th>
                    <th className="px-1 py-2">파워</th>
                    <th className="hidden px-1 py-2 sm:table-cell">시간</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rounds].slice(0, cap).map((r) => {
                    const s = r.sum;
                    const pb = r.pb;
                    const gen = `${valSumOE(s) === "L" ? "홀" : "짝"}·${valSumUO(s) === "L" ? "언" : "오"}·${
                      sizeBucket(s) === "s" ? "소" : sizeBucket(s) === "m" ? "중" : "대"
                    }`;
                    const pwr = `${valPbOE(pb) === "L" ? "홀" : "짝"}·${valPbUO(pb) === "L" ? "언" : "오"}`;
                    const tm = r.created_at
                      ? String(r.created_at).replace("T", " ").slice(0, 16)
                      : "—";
                    return (
                      <tr
                        key={`${r.round_no}-${r.created_at}`}
                        className="border-b border-white/5 hover:bg-white/[0.03]"
                      >
                        <td className="px-2 py-1.5 font-mono text-slate-400">#{r.round_no}</td>
                        <td className="px-1 py-1.5 text-right font-mono">{s ?? "—"}</td>
                        <td className="px-1 py-1.5 text-right font-mono">{pb ?? "—"}</td>
                        <td className="px-1 py-1.5 text-slate-400">{gen}</td>
                        <td className="px-1 py-1.5 text-slate-400">{pwr}</td>
                        <td className="hidden whitespace-nowrap px-1 py-1.5 text-slate-600 sm:table-cell">
                          {tm}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function BarPair({
  label,
  a,
  b,
  left,
  right,
}: {
  label: string;
  a: number;
  b: number;
  left: string;
  right: string;
}) {
  const t = a + b || 1;
  const pa = (a / t) * 100;
  const pbPct = (b / t) * 100;
  return (
    <div className="rounded-lg border border-white/10 bg-[#151b24]/80 p-3">
      <p className="mb-2 text-[11px] font-medium text-slate-500">{label}</p>
      <div className="flex h-9 w-full overflow-hidden rounded-lg">
        <div
          className="flex min-w-0 items-center justify-center bg-sky-600 px-0.5 text-[10px] font-semibold text-white"
          style={{ flexGrow: Math.max(a, 0.0001), flexShrink: 1, flexBasis: 0 }}
        >
          {pa >= 8 ? `${left} ${a} (${pa.toFixed(1)}%)` : a ? `${left} ${a}` : ""}
        </div>
        <div
          className="flex min-w-0 items-center justify-center bg-rose-600 px-0.5 text-[10px] font-semibold text-white"
          style={{ flexGrow: Math.max(b, 0.0001), flexShrink: 1, flexBasis: 0 }}
        >
          {pbPct >= 8 ? `${right} ${b} (${pbPct.toFixed(1)}%)` : b ? `${right} ${b}` : ""}
        </div>
      </div>
      <p className="mt-1.5 flex justify-between text-[10px] text-slate-500">
        <span>
          {left} {a}
        </span>
        <span>
          {right} {b}
        </span>
      </p>
    </div>
  );
}
