"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { MockSportsOddsPanel } from "@/components/admin/MockSportsOddsPanel";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type OddsMap = Record<string, number>;
type Ev = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmaker_key: string;
  bookmaker_title: string;
  raw_odds: OddsMap;
  adjusted_odds: OddsMap;
  margin_pct: number;
};
type SportBlock = { key: string; label: string; events: Ev[]; error: string | null };
type Feed = {
  cached_at: string;
  ttl_sec: number;
  credits_remaining: string | null;
  regions: string;
  margin_pct: number;
  sports: SportBlock[];
  served_from_cache?: boolean;
};

function fmtWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function OddsLivePage() {
  const token = useAuthStore((s) => s.token);
  const base = publicApiBase();

  const q = useQuery({
    queryKey: ["admin", "odds-api-feed", token ?? ""],
    queryFn: async () => {
      const r = await fetch(`${base}/admin/sports/odds-api/feed`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (r.status === 503) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail || "API 키 미설정");
      }
      if (!r.ok) throw new Error(`feed ${r.status}`);
      return (await r.json()) as Feed;
    },
    enabled: Boolean(token),
    staleTime: 55_000,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });

  const feedSummary = useMemo(() => {
    const sports = q.data?.sports;
    if (!sports?.length) return { failed: 0, total: 0, any401: false, firstMsg: null as string | null };
    const failed = sports.filter((s) => s.error).length;
    const any401 = sports.some((s) => (s.error ?? "").includes("401"));
    const firstErr = sports.find((s) => s.error)?.error ?? null;
    return { failed, total: sports.length, any401, firstMsg: firstErr };
  }, [q.data?.sports]);

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <p className="text-premium-label">The Odds API</p>
        <h2
          className="mt-1 text-2xl font-semibold text-slate-100 sm:text-3xl"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          라이브 배당 · 시스템 요율 반영
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          EPL·챔스·5대리그·K리그1·J리그·MLS·KBO·MLB·NHL·NFL 등(서버{" "}
          <code className="text-slate-400">DEFAULT_SPORT_TARGETS</code>). 서버에서{" "}
          <strong className="text-slate-400">{q.data?.ttl_sec ?? 60}초</strong> TTL 캐시로 호출을 묶습니다.
          새로고침은 수동으로만 하세요 (무료 쿼터 보호).
        </p>
      </div>

      <MockSportsOddsPanel />

      {q.data && feedSummary.failed > 0 && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-500/40 bg-amber-950/40 px-4 py-4 text-[15px] leading-relaxed text-slate-100 shadow-[0_0_24px_rgba(245,158,11,0.12)]"
        >
          <p className="font-semibold text-amber-200">
            배당 API 오류 — {feedSummary.failed}/{feedSummary.total} 종목 실패
          </p>
          {feedSummary.any401 && (
            <p className="mt-2 text-sm text-slate-200">
              401 이면 서버의 <code className="rounded bg-black/40 px-1.5 py-0.5 text-slate-100">GAME_PLATFORM_THE_ODDS_API_KEY</code> 를
              the-odds-api.com 에서 발급한 값으로 바꾼 뒤 <strong className="text-white">API 프로세스(8100) 재시작</strong>이 필요합니다.
            </p>
          )}
          {feedSummary.firstMsg && (
            <p className="mt-2 border-t border-amber-500/20 pt-2 text-sm text-slate-300">{feedSummary.firstMsg}</p>
          )}
        </div>
      )}

      {q.data && (
        <div className="glass-card flex flex-wrap items-center gap-4 px-4 py-3 text-sm text-slate-300">
          <span className="rounded-full border border-premium/30 bg-premium/10 px-3 py-1 text-xs font-medium text-premium">
            마진 {q.data.margin_pct}%
          </span>
          <span>
            regions: <span className="font-medium text-slate-200">{q.data.regions}</span>
          </span>
          {q.data.credits_remaining != null && (
            <span>
              잔여 요청(헤더):{" "}
              <span
                className={`font-mono font-medium ${
                  Number(q.data.credits_remaining) === 0 ? "text-amber-300" : "text-emerald-300"
                }`}
              >
                {q.data.credits_remaining}
              </span>
            </span>
          )}
          <span className="text-slate-400">
            캐시: {q.data.served_from_cache ? "HIT" : "MISS"} · {fmtWhen(q.data.cached_at)}
          </span>
          <button
            type="button"
            onClick={() => q.refetch()}
            className="admin-touch-btn ml-auto rounded-xl border border-premium/40 px-5 text-sm font-semibold text-premium hover:bg-premium/10"
          >
            지금 갱신
          </button>
        </div>
      )}

      {q.isLoading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card-sm h-40 shimmer rounded-2xl" />
          ))}
        </div>
      )}

      {q.error && (
        <div className="glass-card border border-red-500/35 bg-red-950/50 px-4 py-4 text-sm leading-relaxed text-slate-100">
          <p className="font-semibold text-red-200">연결 오류</p>
          <p className="mt-2 text-[13px] text-slate-200">{(q.error as Error).message}</p>
          <p className="mt-3 text-xs text-slate-400">
            The Odds API 키·쿼터는 서버 환경변수{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5 text-slate-200">GAME_PLATFORM_THE_ODDS_API_KEY</code>{" "}
            를 확인하세요. 401·잔여 0이면 키가 비었거나 만료·한도 소진입니다.
          </p>
        </div>
      )}

      {(q.data?.sports ?? []).map((sp) => (
        <section key={sp.key} className="glass-card overflow-hidden rounded-2xl">
          <div
            className="flex items-center justify-between border-b px-4 py-3"
            style={{ borderColor: "rgba(212,175,55,0.12)" }}
          >
            <h3 className="font-display text-lg text-premium">{sp.label}</h3>
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-600">{sp.key}</span>
          </div>
          {sp.error && (
            <div className="mx-3 mb-3 mt-2 rounded-xl border border-amber-500/40 bg-slate-950 px-4 py-4 text-[15px] font-medium leading-snug text-slate-100">
              {sp.error}
            </div>
          )}
          {!sp.error && sp.events.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-600">표시할 경기가 없습니다.</p>
          )}
          <div className="divide-y divide-slate-800/60">
            {sp.events.map((ev) => (
              <div key={ev.id} className="px-4 py-4 sm:px-5">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-slate-200">
                    {ev.home_team} <span className="text-slate-600">vs</span> {ev.away_team}
                  </p>
                  <p className="text-xs text-slate-500">{fmtWhen(ev.commence_time)}</p>
                </div>
                <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-600">
                  {ev.bookmaker_title ?? ev.bookmaker_key}
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(ev.adjusted_odds).map(([k, v]) => (
                    <div
                      key={k}
                      className="glass-card-sm rounded-xl px-3 py-2 text-center"
                    >
                      <p className="text-[9px] uppercase tracking-widest text-slate-500">{k}</p>
                      <p className="text-lg font-bold tabular-nums text-premium">{v.toFixed(2)}</p>
                      <p className="text-[10px] text-slate-600">
                        raw {ev.raw_odds[k]?.toFixed(2) ?? "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
