"use client";

import { useEffect, useState } from "react";
import { publicApiBase } from "@/lib/publicApiBase";
import { fetchMockSportsOdds, type MockOddsPayload } from "@/lib/mockSportsOdds";

const POLL_MS = 4000;

function fmtKst(iso: string) {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export function MockSportsOddsPanel() {
  const [data, setData] = useState<MockOddsPayload | null>(null);

  useEffect(() => {
    const base = publicApiBase();
    let cancelled = false;

    const tick = () => {
      void fetchMockSportsOdds(base).then((d) => {
        if (!cancelled) setData(d);
      });
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!data?.matches?.length) return null;

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/40 to-slate-950/80 px-4 py-4 shadow-[0_0_32px_rgba(16,185,129,0.08)]">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400/90">Demo feed</p>
          <h2 className="font-display text-lg font-semibold text-slate-100">모의 라이브 배당</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            서버 내부 시뮬레이터 · tick <span className="font-mono text-emerald-300/90">{data.tick}</span>
            <span className="mx-1.5 text-slate-600">·</span>
            갱신 <span className="font-mono text-slate-400">{fmtKst(data.updated_at)} KST</span>
          </p>
        </div>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-200">
          실제 베팅 DB와 무관 (시연)
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.matches.map((m) => (
          <div
            key={m.match_id}
            className="flex flex-col gap-3 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3"
          >
            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
              <span className="truncate">{m.league}</span>
              <span className="shrink-0 rounded bg-red-500/20 px-1.5 py-0.5 font-medium text-red-300">{m.status}</span>
            </div>
            <div className="flex items-center gap-3">
              <img
                src={m.home_logo_url}
                alt=""
                className="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                loading="lazy"
              />
              <div className="min-w-0 flex-1 text-center">
                <p className="truncate text-xs font-medium text-slate-200">{m.home_team}</p>
                <p className="text-[10px] text-slate-600">vs</p>
                <p className="truncate text-xs font-medium text-slate-200">{m.away_team}</p>
              </div>
              <img
                src={m.away_logo_url}
                alt=""
                className="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                loading="lazy"
              />
            </div>
            <p className="text-center text-[10px] text-slate-600">{fmtKst(m.match_time)} KST</p>
            <div className="grid grid-cols-3 gap-1 border-t border-white/5 pt-2 text-center">
              <div>
                <p className="text-[9px] text-slate-500">홈</p>
                <p className="font-mono text-sm font-semibold tabular-nums text-premium-glow">
                  {m.odds_home.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-slate-500">무</p>
                <p className="font-mono text-sm font-semibold tabular-nums text-slate-200">
                  {m.odds_draw.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-slate-500">원정</p>
                <p className="font-mono text-sm font-semibold tabular-nums text-slate-200">
                  {m.odds_away.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
