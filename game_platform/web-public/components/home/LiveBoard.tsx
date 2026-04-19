"use client";

import { useEffect, useRef, useState } from "react";

import { publicApiBase } from "@/lib/publicApiBase";
import { fetchMockSportsOdds, type MockSportsMatch } from "@/lib/mockSportsOdds";

import { useBetSlip } from "./BetSlipContext";

const POLL_MS = 3000;

type Dir = "up" | "down" | null;

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

function OddButton({
  label,
  value,
  dir,
  onPick,
}: {
  label: string;
  value: number;
  dir: Dir;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="group flex w-full flex-col items-center gap-0.5 rounded-lg border border-white/[0.06] bg-black/25 px-2 py-2 transition hover:border-cyan-400/40 hover:bg-cyan-500/10"
    >
      <span className="text-[9px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="flex items-center gap-1 font-mono text-base font-semibold tabular-nums text-cyan-100 sm:text-lg">
        {dir === "up" && (
          <span className="animate-pulse text-xs text-red-400" aria-hidden>
            ▲
          </span>
        )}
        {dir === "down" && (
          <span className="animate-pulse text-xs text-blue-400" aria-hidden>
            ▼
          </span>
        )}
        {value.toFixed(2)}
      </span>
    </button>
  );
}

export function LiveBoard() {
  const { addLine } = useBetSlip();
  const [matches, setMatches] = useState<MockSportsMatch[]>([]);
  const [meta, setMeta] = useState<{ tick: number; updated_at: string } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const prevRef = useRef<Record<number, { h: number; d: number; a: number }>>({});
  const [dirs, setDirs] = useState<Record<number, { h: Dir; d: Dir; a: Dir }>>({});

  useEffect(() => {
    const base = publicApiBase();
    let cancelled = false;

    const tick = () => {
      void fetchMockSportsOdds(base).then((payload) => {
        if (cancelled) return;
        if (!payload?.matches?.length) {
          setUnavailable(true);
          setMatches([]);
          return;
        }
        setUnavailable(false);
        setMeta({ tick: payload.tick, updated_at: payload.updated_at });

        setDirs(() => {
          const next: Record<number, { h: Dir; d: Dir; a: Dir }> = {};
          for (const m of payload.matches) {
            const p = prevRef.current[m.match_id];
            const h: Dir = p ? (m.odds_home > p.h ? "up" : m.odds_home < p.h ? "down" : null) : null;
            const d: Dir = p ? (m.odds_draw > p.d ? "up" : m.odds_draw < p.d ? "down" : null) : null;
            const a: Dir = p ? (m.odds_away > p.a ? "up" : m.odds_away < p.a ? "down" : null) : null;
            next[m.match_id] = { h, d, a };
          }
          return next;
        });

        for (const m of payload.matches) {
          prevRef.current[m.match_id] = { h: m.odds_home, d: m.odds_draw, a: m.odds_away };
        }
        setMatches(payload.matches);
      });
    };

    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const addPick = (m: MockSportsMatch, side: "home" | "draw" | "away") => {
    const odds = side === "home" ? m.odds_home : side === "draw" ? m.odds_draw : m.odds_away;
    const label =
      side === "home"
        ? `${m.home_team} vs ${m.away_team} — 홈승`
        : side === "draw"
          ? `${m.home_team} vs ${m.away_team} — 무`
          : `${m.home_team} vs ${m.away_team} — 원정`;
    const id = `${m.match_id}-${side}`;
    const ok = addLine({ id, matchId: m.match_id, label, odds });
    if (!ok) window.alert("이미 베팅 슬립에 담긴 선택입니다.");
  };

  return (
    <section className="mt-8 sm:mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-400/80">Live Odds</p>
          <h2 className="font-display text-xl font-semibold text-white sm:text-2xl">실시간 라이브 배당</h2>
          <p className="mt-1 text-[11px] text-slate-500 sm:text-xs">
            모의 스트림 폴링 연동 · 배당 변동 시{" "}
            <span className="text-red-400">▲</span> 상승 / <span className="text-blue-400">▼</span> 하락 표시. 운영
            WebSocket 연동 시 동일 UI로 교체 가능합니다.
          </p>
        </div>
        {meta && (
          <div className="text-right text-[10px] text-slate-500">
            <span className="font-mono text-slate-400">tick {meta.tick}</span>
            <span className="mx-1.5 text-slate-700">·</span>
            <span>{fmtKst(meta.updated_at)} KST</span>
          </div>
        )}
      </div>

      {unavailable ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-950/20 px-6 py-10 text-center text-sm leading-relaxed text-slate-400">
          <p className="font-medium text-amber-200/90">모의 라이브 배당이 꺼져 있습니다.</p>
          <p className="mt-2 text-xs text-slate-500">
            API 서버 환경에{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-cyan-300/90">
              GAME_PLATFORM_USE_MOCK_SPORTS_ODDS=true
            </code>{" "}
            를 넣고 gp-api를 재시작하면 이 영역에 데모 배당이 표시됩니다. 실제 북메이커 연동은 별도 스포츠 피드
            연결이 필요합니다.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#161616]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="min-w-0 divide-y divide-white/[0.06]">
            {matches.map((m) => {
              const dr = dirs[m.match_id] ?? { h: null, d: null, a: null };
              return (
                <div
                  key={m.match_id}
                  className="flex flex-col gap-4 px-3 py-4 sm:flex-row sm:items-stretch sm:px-5"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <img
                      src={m.home_logo_url}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] text-slate-500">{m.league}</p>
                      <p className="truncate text-sm font-medium text-slate-100">{m.home_team}</p>
                      <p className="truncate text-xs text-slate-400">vs {m.away_team}</p>
                      <p className="text-[10px] text-slate-600">{fmtKst(m.match_time)}</p>
                    </div>
                    <img
                      src={m.away_logo_url}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                      loading="lazy"
                    />
                    <span className="hidden shrink-0 rounded bg-red-500/15 px-2 py-1 text-[10px] font-medium text-red-300 sm:inline">
                      {m.status}
                    </span>
                  </div>
                  <div className="grid w-full shrink-0 grid-cols-3 gap-2 sm:w-[min(100%,420px)] sm:gap-3">
                    <OddButton
                      label="홈"
                      value={m.odds_home}
                      dir={dr.h}
                      onPick={() => addPick(m, "home")}
                    />
                    <OddButton
                      label="무"
                      value={m.odds_draw}
                      dir={dr.d}
                      onPick={() => addPick(m, "draw")}
                    />
                    <OddButton
                      label="원정"
                      value={m.odds_away}
                      dir={dr.a}
                      onPick={() => addPick(m, "away")}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
