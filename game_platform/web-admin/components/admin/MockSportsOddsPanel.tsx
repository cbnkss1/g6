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

/** 관리자 스포츠·라이브 배당 화면 상단 — Mock API가 켜져 있을 때만 표시 */
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
    <section className="glass-card overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-premium-label text-emerald-400/90">Demo · Mock odds</p>
          <h3 className="mt-0.5 font-display text-xl font-semibold text-slate-100">모의 라이브 배당</h3>
          <p className="mt-1 text-xs text-slate-500">
            서버 시뮬레이터 tick{" "}
            <span className="font-mono text-emerald-300">{data.tick}</span>
            <span className="mx-1.5 text-slate-600">·</span>
            스냅샷 <span className="font-mono text-slate-400">{fmtKst(data.updated_at)} KST</span>
          </p>
        </div>
        <span className="rounded-full border border-emerald-500/35 bg-emerald-500/15 px-3 py-1 text-[10px] font-semibold text-emerald-200">
          The Odds API 비용 없음
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.matches.map((m) => (
          <div
            key={m.match_id}
            className="glass-card-sm rounded-xl border border-white/10 bg-slate-950/40 p-3"
          >
            <div className="mb-2 flex items-center justify-between text-[10px] text-slate-500">
              <span className="truncate">{m.league}</span>
              <span className="shrink-0 rounded bg-red-500/20 px-1.5 py-0.5 font-medium text-red-200">
                {m.status}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <img
                src={m.home_logo_url}
                alt=""
                className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                loading="lazy"
              />
              <div className="min-w-0 flex-1 text-center text-xs font-medium text-slate-200">
                <p className="truncate">{m.home_team}</p>
                <p className="text-[10px] text-slate-600">vs</p>
                <p className="truncate">{m.away_team}</p>
              </div>
              <img
                src={m.away_logo_url}
                alt=""
                className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                loading="lazy"
              />
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-600">{fmtKst(m.match_time)} KST</p>
            <div className="mt-2 grid grid-cols-3 gap-1 border-t border-white/5 pt-2 text-center">
              <div>
                <p className="text-[9px] uppercase tracking-wider text-slate-500">홈</p>
                <p className="text-lg font-bold tabular-nums text-premium">{m.odds_home.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider text-slate-500">무</p>
                <p className="text-lg font-bold tabular-nums text-slate-200">{m.odds_draw.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider text-slate-500">원정</p>
                <p className="text-lg font-bold tabular-nums text-slate-200">{m.odds_away.toFixed(2)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
