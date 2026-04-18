"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PowerballStatsRoadmap } from "@/components/powerball/PowerballStatsRoadmap";
import { PowerballTrendCharts } from "@/components/powerball/PowerballTrendCharts";
import { SiteHeader } from "@/components/SiteHeader";
import { usePlayerAuth } from "@/lib/playerAuthContext";
import {
  fetchMyPowerballBets,
  fetchPowerballOverview,
  placePowerballBet,
  type PowerballBetRow,
  type PowerballGameInfo,
  type PowerballOverview,
} from "@/lib/playerGamesApi";

const POLL_MS = 2500;

/** app/services/powerball_service._POWERBALL_LIVE_IFRAME_BY_KEY 와 동기 — API 미응답 시에도 라이브 표시 */
const BEPICK_LIVE_BY_KEY: Record<string, string> = {
  coinpowerball3: "https://bepick.net/live/coinpower3/scrap",
  coinpowerball5: "https://bepick.net/live/coinpower5/scrap",
  eospowerball3: "https://bepick.net/live/coinpower5/scrap",
  eospowerball: "https://bepick.net/live/eosball5m/scrap",
  pbg: "https://bepick.net/live/pbgpowerball/scrap",
};

const KNOWN_GAME_KEYS = [
  "coinpowerball3",
  "coinpowerball5",
  "eospowerball3",
  "eospowerball",
  "pbg",
] as const;

const POWERBALL_TAB_LABELS: Record<string, string> = {
  coinpowerball3: "코인 3분",
  coinpowerball5: "코인 5분",
  eospowerball3: "EOS 3분",
  eospowerball: "EOS 5분",
  pbg: "PBG",
};

function defaultGamesCatalog(): PowerballGameInfo[] {
  return KNOWN_GAME_KEYS.map((key) => ({
    key,
    label: POWERBALL_TAB_LABELS[key] ?? key,
    next_round: 1,
    live_iframe_url: BEPICK_LIVE_BY_KEY[key] ?? BEPICK_LIVE_BY_KEY.coinpowerball3,
  }));
}

const OFFLINE_VALID_PICKS = [
  "sum_odd",
  "sum_even",
  "sum_under",
  "sum_over",
  "size_s",
  "size_m",
  "size_l",
  "pb_odd",
  "pb_even",
  "pb_under",
  "pb_over",
] as const;

/** API(/gp-api) 실패 시에도 영상·회차·탭은 보이게 하는 최소 overview */
function offlinePowerballOverview(selectedKey: string): PowerballOverview {
  const gk = selectedKey.trim() || "coinpowerball3";
  const odds_by_pick: Record<string, string> = {};
  for (const p of OFFLINE_VALID_PICKS) {
    odds_by_pick[p] = "1.95";
  }
  return {
    balance: "0",
    next_round: 1,
    min_bet: "100",
    max_bet: "100000000",
    odds_by_pick,
    valid_picks: [...OFFLINE_VALID_PICKS],
    live_iframe_url: "",
    game_key: gk,
    games: defaultGamesCatalog(),
    recent_rounds: [],
  };
}

function resolveLiveIframeUrl(ov: PowerballOverview | null, selectedGameKey: string): string {
  const fromApi = ov?.live_iframe_url?.trim();
  if (fromApi) return fromApi;
  const gk = (selectedGameKey || ov?.game_key || "coinpowerball3").trim();
  return BEPICK_LIVE_BY_KEY[gk] || BEPICK_LIVE_BY_KEY.coinpowerball3;
}

function resolveNextRound(ov: PowerballOverview | null, selectedGameKey: string): number {
  const gk = (ov?.game_key || selectedGameKey).trim();
  let server = 1;
  if (ov?.next_round != null && Number.isFinite(Number(ov.next_round))) {
    server = Math.max(1, Math.floor(Number(ov.next_round)));
  } else {
    const hit = ov?.games?.find((g) => g.key === gk);
    if (hit?.next_round != null && Number.isFinite(Number(hit.next_round))) {
      server = Math.max(1, Math.floor(Number(hit.next_round)));
    }
  }
  // 배팅 회차는 gp-api `get_next_round` 단일 기준. recent_rounds 에 남은 레거시(YYYYMMDD+ 거대 번호)로
  // max+1 을 올리면 표시만 20260418462 처럼 깨짐 — 서버 값만 사용.
  return server;
}

const PICK_META: Record<string, { label: React.ReactNode; accent?: string }> = {
  sum_odd: { label: <>일반볼 <span className="text-sky-400">홀</span></>, accent: "sky" },
  sum_even: { label: <>일반볼 <span className="text-rose-400">짝</span></>, accent: "rose" },
  sum_under: { label: <>일반볼 <span className="text-emerald-400">언더</span></>, accent: "emerald" },
  sum_over: { label: <>일반볼 <span className="text-amber-400">오버</span></>, accent: "amber" },
  size_s: { label: "소" },
  size_m: { label: <span className="text-premium-glow">중</span> },
  size_l: { label: "대" },
  pb_odd: { label: <>파워볼 <span className="text-sky-400">홀</span></>, accent: "sky" },
  pb_even: { label: <>파워볼 <span className="text-rose-400">짝</span></>, accent: "rose" },
  pb_under: { label: <>파워볼 <span className="text-emerald-400">언더</span></>, accent: "emerald" },
  pb_over: { label: <>파워볼 <span className="text-amber-400">오버</span></>, accent: "amber" },
};

type BetMode = "single" | "multi";

function fmtInt(v: string | number) {
  return Math.floor(Number(v) || 0).toLocaleString("ko-KR");
}

function oddsNum(ov: PowerballOverview | null, pick: string) {
  const s = ov?.odds_by_pick?.[pick];
  const n = parseFloat(s ?? "1.95");
  return Number.isFinite(n) ? n : 1.95;
}

/** 최근 회차 표용 — 합·PB 기준 라벨 */
function lblSumOE(s: number | null | undefined) {
  if (s == null || !Number.isFinite(Number(s))) return "—";
  return Number(s) % 2 === 1 ? "홀" : "짝";
}
function lblSumUO(s: number | null | undefined) {
  if (s == null || !Number.isFinite(Number(s))) return "—";
  return Number(s) <= 72 ? "언" : "오";
}
function lblSize(s: number | null | undefined) {
  if (s == null || !Number.isFinite(Number(s))) return "—";
  const v = Number(s);
  if (v <= 72) return "소";
  if (v <= 80) return "중";
  return "대";
}
function lblPbOE(pb: number | null | undefined) {
  if (pb == null || !Number.isFinite(Number(pb))) return "—";
  return Number(pb) % 2 === 1 ? "홀" : "짝";
}
function lblPbUO(pb: number | null | undefined) {
  if (pb == null || !Number.isFinite(Number(pb))) return "—";
  return Number(pb) <= 4 ? "언" : "오";
}
function fmtRoundTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const t = iso.replace("T", " ").slice(0, 16);
  return t.length > 10 ? t : iso.slice(0, 10);
}

export default function PowerballPage() {
  const { token, hydrated, openLogin } = usePlayerAuth();
  const [ov, setOv] = useState<PowerballOverview | null>(null);
  const [bets, setBets] = useState<PowerballBetRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [betMode, setBetMode] = useState<BetMode>("single");
  const [betAmount, setBetAmount] = useState(0);
  const [amountInput, setAmountInput] = useState("0");
  const [singlePick, setSinglePick] = useState<string | null>(null);
  const [multiPicks, setMultiPicks] = useState<{ id: string; odds: number }[]>([]);
  /** 비어 있으면 첫 로드 시 서버 기본 종목으로 채움 */
  const [gameKey, setGameKey] = useState("");
  /** 데스크톱: 영상 옆 패널(금액·픽) 접기 — 영상만 크게 */
  const [betPanelOpen, setBetPanelOpen] = useState(true);
  /** 사이드(결과·내역) 접기 */
  const [sideOpen, setSideOpen] = useState(true);
  /** 실시간 iframe 영역 더 크게 (뷰포트 활용) */
  const [liveTall, setLiveTall] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const balanceInt = useMemo(() => Math.floor(Number(ov?.balance ?? 0) || 0), [ov?.balance]);
  const minBet = useMemo(() => Math.max(1, Math.floor(Number(ov?.min_bet ?? 1) || 1)), [ov?.min_bet]);
  const maxBet = useMemo(
    () => Math.max(minBet, Math.floor(Number(ov?.max_bet ?? 100_000_000) || 100_000_000)),
    [ov?.max_bet, minBet],
  );

  const effectiveGameKey = useMemo(
    () => (gameKey.trim() || ov?.game_key || "coinpowerball3").trim(),
    [gameKey, ov?.game_key],
  );

  const gameTabs = useMemo((): PowerballGameInfo[] => {
    if (ov?.games && ov.games.length > 0) return ov.games;
    return defaultGamesCatalog();
  }, [ov?.games]);

  const liveUrl = useMemo(
    () => resolveLiveIframeUrl(ov, effectiveGameKey),
    [ov, effectiveGameKey],
  );

  /** 배포/프록시 이슈로 빈 문자열이 와도 Bepick 고정 URL로 항상 재생 시도 */
  const safeLiveUrl = useMemo(() => {
    const u = (liveUrl || "").trim();
    if (u.startsWith("http://") || u.startsWith("https://")) return u;
    const gk = effectiveGameKey || "coinpowerball3";
    return BEPICK_LIVE_BY_KEY[gk] || BEPICK_LIVE_BY_KEY.coinpowerball3;
  }, [liveUrl, effectiveGameKey]);

  const nextRoundNum = useMemo(
    () => resolveNextRound(ov, effectiveGameKey),
    [ov, effectiveGameKey],
  );

  const displayRound = useMemo(() => {
    const n = Math.floor(Number(nextRoundNum));
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [nextRoundNum]);

  const liveIsClientFallback = Boolean(!ov?.live_iframe_url?.trim() && safeLiveUrl);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token) return;
      if (!opts?.silent) setLoading(true);
      setErr(null);
      try {
        const gq = gameKey.trim() || undefined;
        const [o, b] = await Promise.all([
          fetchPowerballOverview(token, gq, { recentLimit: 400 }),
          fetchMyPowerballBets(token, gq),
        ]);
        if (!gameKey.trim() && o.game_key) {
          setGameKey(o.game_key);
        }
        setOv(o);
        setBets(b.items);
      } catch (e) {
        if (!opts?.silent) {
          setErr(e instanceof Error ? e.message : "불러오기 실패");
          setOv(offlinePowerballOverview(gameKey));
        }
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [token, gameKey],
  );

  useEffect(() => {
    if (!hydrated || !token) return;
    void load();
  }, [hydrated, token, load]);

  useEffect(() => {
    setSinglePick(null);
    setMultiPicks([]);
  }, [gameKey]);

  useEffect(() => {
    if (!token || !hydrated) return;
    pollRef.current = setInterval(() => {
      void load({ silent: true });
    }, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [token, hydrated, load]);

  function syncAmountFromInput() {
    let n = parseInt(amountInput.replace(/,/g, ""), 10);
    if (!Number.isFinite(n) || n < 0) n = 0;
    n = Math.min(n, balanceInt, maxBet);
    setBetAmount(n);
    setAmountInput(String(n));
  }

  function addChip(n: number) {
    const next = Math.min(betAmount + n, balanceInt, maxBet);
    setBetAmount(next);
    setAmountInput(String(next));
  }

  function resetChip() {
    setBetAmount(0);
    setAmountInput("0");
  }

  function allIn() {
    const cap = Math.min(balanceInt, maxBet);
    setBetAmount(cap);
    setAmountInput(String(cap));
  }

  function togglePick(pick: string) {
    const o = oddsNum(ov, pick);
    if (betMode === "single") {
      setSinglePick((prev) => (prev === pick ? null : pick));
      return;
    }
    setMultiPicks((prev) => {
      const i = prev.findIndex((p) => p.id === pick);
      if (i >= 0) return prev.filter((_, j) => j !== i);
      return [...prev, { id: pick, odds: o }];
    });
  }

  const isSelected = (pick: string) =>
    betMode === "single" ? singlePick === pick : multiPicks.some((p) => p.id === pick);

  const combinedOdds = useMemo(() => {
    if (multiPicks.length === 0) return 1;
    return multiPicks.reduce((a, p) => a * p.odds, 1);
  }, [multiPicks]);

  const expectedWin = Math.floor(betAmount * combinedOdds);

  async function onSubmit() {
    if (!token || !ov) {
      if (!ov) setErr("경기 정보를 불러온 뒤 베팅할 수 있습니다. 잠시 후 새로고침 해 주세요.");
      return;
    }
    if (betAmount < minBet) {
      setErr(`최소 ${fmtInt(minBet)} 이상 베팅하세요.`);
      return;
    }
    if (betAmount > maxBet) {
      setErr(`1회 최대 ${fmtInt(maxBet)} 까지 베팅할 수 있습니다.`);
      return;
    }
    let pickStr = "";
    if (betMode === "single") {
      if (!singlePick) {
        setErr("베팅할 칸을 선택하세요.");
        return;
      }
      pickStr = singlePick;
    } else {
      if (multiPicks.length < 2) {
        setErr("조합은 2개 이상 선택하세요.");
        return;
      }
      pickStr = multiPicks.map((p) => p.id).join("|");
    }
    setSubmitting(true);
    setErr(null);
    try {
      await placePowerballBet(token, pickStr, String(betAmount), ov.game_key);
      setSinglePick(null);
      setMultiPicks([]);
      await load({ silent: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "베팅 실패");
    } finally {
      setSubmitting(false);
    }
  }

  function BetCell({ pick }: { pick: string }) {
    const meta = PICK_META[pick] ?? { label: pick };
    const odd = oddsNum(ov, pick).toFixed(2);
    const on = isSelected(pick);
    return (
      <button
        type="button"
        onClick={() => togglePick(pick)}
        className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl border px-2 py-2 text-sm transition ${
          on
            ? "border-amber-400/80 bg-amber-500/15 ring-2 ring-amber-400/50"
            : "border-white/10 bg-[#1a1f2e] hover:border-white/20"
        }`}
      >
        <span className="text-center text-xs text-slate-200">{meta.label}</span>
        <span className="mt-0.5 font-mono text-base font-semibold text-premium-glow">{odd}</span>
      </button>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0e14]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-none flex-1 space-y-3 px-2 py-3 sm:space-y-4 sm:px-4 md:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-premium">파워볼</p>
            <h1
              className="font-display text-xl font-semibold text-slate-100 sm:text-2xl"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              라이브 파워볼
            </h1>
            <p className="mt-0.5 text-[11px] text-slate-600">실시간 화면 + 게임머니 베팅</p>
            {process.env.NEXT_PUBLIC_BUILD_STAMP ? (
              <p className="mt-0.5 font-mono text-[9px] text-slate-700">
                빌드 {process.env.NEXT_PUBLIC_BUILD_STAMP}
              </p>
            ) : null}
            <details className="mt-2 max-w-xl text-[10px] leading-relaxed text-slate-600">
              <summary className="cursor-pointer list-none text-slate-500 marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="text-amber-600/80 underline decoration-dotted">배포·라이브 URL 안내</span>{" "}
                (펼치기)
              </summary>
              <p className="mt-2 border-l border-amber-900/40 pl-3">
                최신 화면은 <span className="text-slate-500">「실시간 영상」</span> Bepick iframe 입니다.{" "}
                <span className="text-amber-600/90">「라이브 URL이 설정되지 않았습니다」</span>만 보이면 이
                도메인에 <code className="rounded bg-white/5 px-1 text-slate-500">web-public</code> 최신 빌드가
                아닐 수 있습니다 — <code className="rounded bg-white/5 px-1">npm run build</code> 후 재배포·캐시
                무효화를 해 주세요.
              </p>
            </details>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link href="/" className="text-slate-500 hover:text-premium-glow">
              ← 메인
            </Link>
          </div>
        </div>

        {!hydrated ? (
          <p className="text-sm text-slate-500">불러오는 중…</p>
        ) : !token ? (
          <div className="glass-panel space-y-4 p-6 text-center">
            <p className="text-slate-400">로그인 후 이용할 수 있습니다.</p>
            <button
              type="button"
              onClick={() => openLogin()}
              className="min-h-[52px] w-full max-w-xs rounded-xl bg-gradient-to-r from-emerald-400 to-green-500 font-medium text-slate-950"
            >
              로그인
            </button>
          </div>
        ) : (
          <>
            {loading && !ov ? (
              <p className="mb-2 text-sm text-slate-500">데이터 동기화 중…</p>
            ) : null}
            {err && !ov ? (
              <div className="mb-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95">
                <strong>API 연결 실패</strong>
                <span className="mt-1 block text-xs text-amber-200/80">{err}</span>
                <span className="mt-2 block text-[11px] text-slate-500">
                  라이브는 Bepick 기본 채널로 표시합니다. 베팅·잔액·회차는 서버(
                  <code className="text-slate-600">/gp-api</code>) 복구 후 정상화됩니다.
                </span>
              </div>
            ) : null}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4 xl:gap-5">
            <div className="min-w-0 flex-1 space-y-3">
              {gameTabs.length > 1 ? (
                <div className="scrollbar-hide flex flex-wrap gap-2">
                  {gameTabs.map((g) => (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => setGameKey(g.key)}
                      className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                        effectiveGameKey === g.key
                          ? "bg-amber-500/90 text-slate-950"
                          : "border border-white/10 text-slate-400 hover:border-amber-500/40"
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {/* 영상 + 배팅: 넓은 화면에서 한 줄(베픽처럼 시야 이동 최소화) */}
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:gap-3 2xl:gap-4">
                {/* 실시간 화면 — aspect만 쓰면 가로가 줄 때 영상이 너무 작아져서 vh 기준 높이를 둠 */}
                <section className="min-w-0 w-full flex-1 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#121820] shadow-lg shadow-black/20 xl:min-w-[min(100%,520px)] 2xl:min-w-[560px]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-3 py-2 text-xs text-slate-500">
                    <span>
                      실시간 영상
                      <span className="ml-2 font-mono text-slate-600">({effectiveGameKey})</span>
                      {liveIsClientFallback ? (
                        <span className="ml-2 text-[10px] text-slate-600">· 기본 URL</span>
                      ) : null}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setLiveTall((v) => !v)}
                        className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100/95 hover:border-amber-400/50"
                      >
                        {liveTall ? "영상 기본 크기" : "영상 크게"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBetPanelOpen((v) => !v)}
                        className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-amber-200/90 hover:border-amber-500/40"
                      >
                        {betPanelOpen ? "배팅 접기" : "배팅 펼치기"}
                      </button>
                    </div>
                  </div>
                  <div
                    className="relative w-full bg-black"
                    style={{
                      height: liveTall
                        ? "clamp(380px, min(72vh, 70vw), 960px)"
                        : "clamp(300px, min(58vh, 62vw), 860px)",
                    }}
                  >
                    <iframe
                      key={`${effectiveGameKey}-${safeLiveUrl}`}
                      title="실시간 파워볼"
                      src={safeLiveUrl}
                      className="absolute inset-0 h-full w-full border-0"
                      scrolling="no"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                  <div className="border-t border-white/5 px-3 py-2 text-center">
                    <a
                      href={safeLiveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-premium-glow hover:underline"
                    >
                      새 창에서 크게 보기
                    </a>
                  </div>
                </section>

                {/* 배팅판: xl 이상에서 영상 오른쪽에 붙음 (스크롤 최소화) */}
                {betPanelOpen ? (
              <section className="rounded-xl border border-[#2a3140] bg-[#151b24] p-3 sm:p-4 xl:sticky xl:top-20 xl:max-h-[min(88vh,920px)] xl:w-[min(100%,360px)] xl:shrink-0 xl:overflow-y-auto xl:shadow-xl">
                <div className="mb-3 hidden items-center justify-between border-b border-white/5 pb-2 xl:flex">
                  <span className="text-xs font-semibold text-slate-400">빠른 배팅</span>
                  <button
                    type="button"
                    onClick={() => setBetPanelOpen(false)}
                    className="text-[11px] text-amber-400/90 hover:text-amber-300"
                  >
                    패널 접기 · 영상만
                  </button>
                </div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-lg font-bold text-premium-glow sm:text-xl">
                      제 {displayRound} 회차
                      {err ? (
                        <span className="ml-2 text-xs font-normal text-slate-600">(API 복구 시 확정)</span>
                      ) : null}
                    </span>
                    {ov?.recent_rounds?.length ? (
                      <p className="mt-0.5 font-mono text-[10px] text-slate-600">
                        직전 결과 회차 #
                        {(() => {
                          const ns = ov.recent_rounds
                            .map((r) => Math.floor(Number(r.round_no)))
                            .filter((n) => Number.isFinite(n) && n > 0);
                          return ns.length ? Math.max(...ns) : "—";
                        })()}
                        · 표시 회차는 서버·결과표와 맞춤
                      </p>
                    ) : null}
                  </div>
                  <div className="flex rounded-lg border border-white/10 p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setBetMode("single");
                        setMultiPicks([]);
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                        betMode === "single" ? "bg-amber-500/20 text-amber-200" : "text-slate-500"
                      }`}
                    >
                      단폴
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBetMode("multi");
                        setSinglePick(null);
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                        betMode === "multi" ? "bg-amber-500/20 text-amber-200" : "text-slate-500"
                      }`}
                    >
                      조합
                    </button>
                  </div>
                </div>

                <div className="mb-4 rounded-xl border border-[#333] bg-[#252525] p-4">
                  {betMode === "multi" && multiPicks.length > 0 ? (
                    <p className="mb-2 text-center text-sm text-amber-200/90">
                      {multiPicks.length}폴더 · 배당{" "}
                      <span className="font-mono text-emerald-400">{combinedOdds.toFixed(2)}</span> · 예상{" "}
                      <span className="font-mono">{fmtInt(expectedWin)}</span>
                    </p>
                  ) : null}
                  <p className="mb-3 text-right text-sm text-slate-500">
                    보유 머니{" "}
                    <span className="text-lg font-bold text-amber-300">{fmtInt(ov?.balance ?? 0)}</span>
                  </p>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {[
                      { n: 100, label: "+100" },
                      { n: 1000, label: "+1,000" },
                      { n: 10000, label: "+10,000" },
                    ].map((c) => (
                      <button
                        key={c.n}
                        type="button"
                        onClick={() => addChip(c.n)}
                        className="rounded-lg border border-white/15 bg-[#333] px-3 py-2 text-xs text-slate-200 hover:border-amber-500/40"
                      >
                        {c.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={allIn}
                      className="rounded-lg border border-amber-600/50 bg-[#443300] px-3 py-2 text-xs text-amber-200"
                    >
                      전액
                    </button>
                    <button
                      type="button"
                      onClick={resetChip}
                      className="rounded-lg border border-red-500/30 bg-[#331111] px-3 py-2 text-xs text-red-300"
                    >
                      초기화
                    </button>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={maxBet}
                    className="w-full rounded-xl border border-[#444] bg-[#1a1a1a] px-3 py-3 text-center font-mono text-lg text-white outline-none focus:border-amber-500/50"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    onBlur={syncAmountFromInput}
                  />
                  <p className="mt-2 text-center text-[11px] text-slate-600">
                    최소 {fmtInt(minBet)} · 최대 {fmtInt(maxBet)}
                  </p>
                </div>

                <details open className="group mb-2 rounded-lg border border-white/10 bg-[#1a1f2e]/30">
                  <summary className="cursor-pointer list-none px-2 py-2 text-xs font-semibold text-slate-400 marker:content-none [&::-webkit-details-marker]:hidden">
                    일반볼 구간 <span className="font-normal text-slate-600">(탭하여 접기)</span>
                  </summary>
                  <div className="space-y-2 px-2 pb-3">
                    <div className="grid grid-cols-2 gap-2">
                      <BetCell pick="sum_odd" />
                      <BetCell pick="sum_even" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <BetCell pick="sum_under" />
                      <BetCell pick="sum_over" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <BetCell pick="size_s" />
                      <BetCell pick="size_m" />
                      <BetCell pick="size_l" />
                    </div>
                  </div>
                </details>

                <details open className="group mb-1 rounded-lg border border-white/10 bg-[#1a1f2e]/30">
                  <summary className="cursor-pointer list-none px-2 py-2 text-xs font-semibold text-slate-400 marker:content-none [&::-webkit-details-marker]:hidden">
                    파워볼 구간 <span className="font-normal text-slate-600">(탭하여 접기)</span>
                  </summary>
                  <div className="space-y-2 px-2 pb-3">
                    <div className="grid grid-cols-2 gap-2">
                      <BetCell pick="pb_odd" />
                      <BetCell pick="pb_even" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <BetCell pick="pb_under" />
                      <BetCell pick="pb_over" />
                    </div>
                  </div>
                </details>

                <button
                  type="button"
                  disabled={submitting || !ov || Boolean(err)}
                  onClick={() => void onSubmit()}
                  className="mt-6 min-h-[52px] w-full rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 text-lg font-bold text-slate-950 disabled:opacity-50"
                >
                  {submitting
                    ? "처리 중…"
                    : err
                      ? "API 연결 후 베팅 가능"
                      : betMode === "single"
                        ? "베팅하기"
                        : "조합 베팅하기"}
                </button>
              </section>
                ) : (
                  <div className="flex flex-col justify-center gap-2 xl:min-h-[200px] xl:w-[min(100%,360px)] xl:shrink-0">
                    <p className="text-center text-xs text-slate-500 xl:px-2">배팅 패널을 접었습니다. 영상만 넓게 볼 수 있어요.</p>
                    <button
                      type="button"
                      onClick={() => setBetPanelOpen(true)}
                      className="rounded-xl border border-amber-500/40 bg-amber-500/10 py-3 text-sm font-medium text-amber-200 hover:bg-amber-500/20"
                    >
                      배팅판 다시 펼치기
                    </button>
                  </div>
                )}
              </div>

              {err && ov ? (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {err}
                </div>
              ) : null}

            </div>

            {/* 사이드: 최근 회차 + 내 베팅 (접기 가능 → 중앙 영역 넓게) */}
            <aside className="w-full shrink-0 space-y-3 lg:w-80 xl:min-w-[300px] xl:max-w-[400px] 2xl:max-w-[440px]">
              <button
                type="button"
                onClick={() => setSideOpen((v) => !v)}
                className="w-full rounded-lg border border-white/10 bg-[#151b24] px-3 py-2 text-left text-xs font-medium text-slate-400 hover:border-amber-500/30"
              >
                {sideOpen ? "▼ 사이드 접기 (결과·내역)" : "▶ 사이드 펼치기"}
              </button>
              {sideOpen ? (
                <>
              <section className="rounded-xl border border-amber-900/30 bg-[#151b24] p-3 sm:p-4">
                <h2 className="mb-2 border-b border-white/10 pb-2 text-sm font-semibold text-slate-300">
                  최근 회차 결과
                </h2>
                <div className="max-h-52 overflow-auto rounded-lg border border-white/10 sm:max-h-60">
                  {(ov?.recent_rounds ?? []).length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-slate-600">API 연결 후 표가 채워집니다.</p>
                  ) : (
                    <table className="w-full border-collapse text-left text-[11px] text-slate-300">
                      <thead className="sticky top-0 z-[1] border-b border-white/10 bg-[#1c2330] text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="whitespace-nowrap px-2 py-2">회차</th>
                          <th className="px-1 py-2 text-right">합</th>
                          <th className="px-1 py-2 text-right">PB</th>
                          <th className="px-1 py-2">일반</th>
                          <th className="px-1 py-2">파워</th>
                          <th className="hidden px-1 py-2 sm:table-cell">시간</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(ov?.recent_rounds ?? []).slice(0, 20).map((r) => {
                          const s = r.sum;
                          const pb = r.pb;
                          const gen = `${lblSumOE(s)}·${lblSumUO(s)}·${lblSize(s)}`;
                          const pwr = `${lblPbOE(pb)}·${lblPbUO(pb)}`;
                          return (
                            <tr
                              key={`${r.round_no}-${r.created_at ?? r.sum}`}
                              className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
                            >
                              <td className="whitespace-nowrap px-2 py-1.5 font-mono text-slate-400">
                                #{r.round_no}
                              </td>
                              <td className="px-1 py-1.5 text-right font-mono text-slate-200">{s ?? "—"}</td>
                              <td className="px-1 py-1.5 text-right font-mono text-slate-200">{pb ?? "—"}</td>
                              <td className="px-1 py-1.5 text-slate-400">{gen}</td>
                              <td className="px-1 py-1.5 text-slate-400">{pwr}</td>
                              <td className="hidden whitespace-nowrap px-1 py-1.5 text-slate-600 sm:table-cell">
                                {fmtRoundTime(r.created_at)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
                  일반: 홀짝·언오·소중대 / 파워: 홀짝·언오(5 기준)
                </p>
              </section>

              <section className="rounded-xl border border-white/10 bg-[#151b24] p-3 sm:p-4">
                <h2 className="mb-2 text-sm font-semibold text-slate-300">내 베팅</h2>
                <div className="max-h-64 overflow-auto rounded-lg border border-white/10">
                  {bets.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-slate-600">아직 내역이 없습니다.</p>
                  ) : (
                    <table className="w-full border-collapse text-left text-[11px]">
                      <thead className="sticky top-0 z-[1] border-b border-white/10 bg-[#1c2330] text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-2 py-2">회차</th>
                          <th className="px-1 py-2">종목</th>
                          <th className="px-1 py-2">픽</th>
                          <th className="px-1 py-2 text-right">금액</th>
                          <th className="px-2 py-2">상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bets.map((b) => (
                          <tr
                            key={b.id}
                            className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
                          >
                            <td className="whitespace-nowrap px-2 py-1.5 font-mono text-slate-500">
                              #{b.round_no}
                            </td>
                            <td className="max-w-[72px] truncate px-1 py-1.5 text-[10px] text-slate-600">
                              {b.game_key}
                            </td>
                            <td className="max-w-[100px] truncate px-1 py-1.5 text-slate-300">{b.pick}</td>
                            <td className="whitespace-nowrap px-1 py-1.5 text-right font-mono text-premium-glow">
                              {fmtInt(b.amount)}
                            </td>
                            <td
                              className={`whitespace-nowrap px-2 py-1.5 ${
                                b.status === "won"
                                  ? "text-emerald-400"
                                  : b.status === "lost"
                                    ? "text-red-400"
                                    : "text-amber-300"
                              }`}
                            >
                              {b.status}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
                </>
              ) : null}
            </aside>
          </div>

          {ov ? (
            <section className="mt-8 w-full space-y-4 border-t border-white/10 pt-6">
              <div>
                <h2 className="text-base font-semibold text-slate-200">통계 · 중국식 출줄</h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  서버에서 가져온 최신 회차까지 자동 갱신됩니다. 출줄은 열을 잘라내지 않고 전부 그리며, 새 회차가 붙으면
                  맨 오른쪽(최신)으로 스크롤이 맞춰집니다.
                </p>
              </div>
              <PowerballTrendCharts rounds={ov.recent_rounds ?? []} limit={288} />
              <PowerballStatsRoadmap rounds={ov.recent_rounds ?? []} />
            </section>
          ) : null}
          </>
        )}
      </main>
    </div>
  );
}
