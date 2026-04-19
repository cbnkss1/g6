"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { MockSportsOddsPanel } from "@/components/MockSportsOddsPanel";
import { SiteHeader } from "@/components/SiteHeader";
import { formatPlayerMoney } from "@/lib/formatPlayerMoney";
import { usePlayerAuth } from "@/lib/playerAuthContext";
import {
  fetchSportsMatches,
  placeSportsBet,
  type SportsMatchRow,
} from "@/lib/playerGamesApi";

/* ── 상수 ─────────────────────────────────────────────── */
const OUT_LABEL: Record<string, string> = {
  HOME_WIN: "홈",
  DRAW: "무",
  AWAY_WIN: "원정",
};

const H2H_KEYS = new Set(["HOME_WIN", "DRAW", "AWAY_WIN"]);

function normOutcome(outcome: string | null | undefined): string {
  return (outcome ?? "").trim().toUpperCase();
}

/** T_O_220_5, S_H_M5_5 등 → 표시용 라벨 */
function outcomeLabel(outcome: string, home: string, away: string): string {
  const o = outcome.toUpperCase();
  if (OUT_LABEL[o]) return OUT_LABEL[o];
  const tm = /^T_([OU])_(\d+)_(\d)$/.exec(o);
  if (tm) {
    const line = `${tm[2]}.${tm[3]}`;
    return tm[1] === "O" ? `오버 ${line}` : `언더 ${line}`;
  }
  const sm = /^S_([HA])_([MP])(\d+)_(\d)$/.exec(o);
  if (sm) {
    const sign = sm[2] === "M" ? "-" : "+";
    const line = `${sign}${sm[3]}.${sm[4]}`;
    const side = sm[1] === "H" ? home : away;
    return `핸디 ${side} ${line}`;
  }
  return outcome;
}
const SPORT_EMOJI: Record<string, string> = {
  SOCCER: "⚽",
  BASKETBALL: "🏀",
  BASEBALL: "⚾",
  TENNIS: "🎾",
  ICEHOCKEY: "🏒",
  AMERICAN_FOOTBALL: "🏈",
};

const RESULT_KO: Record<string, string> = {
  HOME_WIN: "홈승",
  DRAW: "무승부",
  AWAY_WIN: "원정승",
  CANCELLED: "취소",
  POSTPONED: "연기",
};

type SlipItem = {
  matchId: number;
  outcome: string;
  odds: string;
  homeTeam: string;
  awayTeam: string;
};

/* ── 포맷 유틸 (PC 타임존과 무관하게 항상 한국 표준시) ─────────────────── */
function fmtDateKst(iso: string | null) {
  if (!iso) return "일정 미정";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "일정 미정";
  return (
    d.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }) + " KST"
  );
}

function formatNowKst() {
  return new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function fmtMoney(v: string | number) {
  return formatPlayerMoney(v);
}

/** 시작 시각 경과 여부 (브라우저 시계 기준, 서버와 이중 검증) */
function matchKickoffPassedClient(iso: string | null): boolean {
  if (!iso) return true;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return true;
  return t <= Date.now();
}

/* ══════════════════════════════════════════════════════ */
function SportsPageInner() {
  const { token, hydrated, openLogin } = usePlayerAuth();
  const searchParams = useSearchParams();
  const presetAppliedFor = useRef<string | null>(null);
  const [items, setItems] = useState<SportsMatchRow[]>([]);
  const [closedItems, setClosedItems] = useState<SportsMatchRow[]>([]);
  const [balance, setBalance] = useState("0");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** 배팅 가능 | 마감·종료 */
  const [listScope, setListScope] = useState<"open" | "closed">("open");

  /* 베팅슬립 (멀티폴더) */
  const [slip, setSlip] = useState<SlipItem[]>([]);
  const [stake, setStake] = useState("10000");

  /* 리그 탭 */
  const [activeLeague, setActiveLeague] = useState<string>("전체");

  /* 한국 현재 시각 표시용 (30초마다 갱신) */
  const [kstNowLabel, setKstNowLabel] = useState(formatNowKst);
  useEffect(() => {
    setKstNowLabel(formatNowKst());
    const id = window.setInterval(() => setKstNowLabel(formatNowKst()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const loadOpen = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const d = await fetchSportsMatches(token, "open");
      setItems(d.items);
      setBalance(d.balance);
      setSlip((prev) => prev.filter((s) => d.items.some((m) => m.id === s.matchId)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "불러오기 실패");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadClosed = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const d = await fetchSportsMatches(token, "closed");
      setClosedItems(d.items);
      setBalance(d.balance);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "불러오기 실패");
      setClosedItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const load = useCallback(async () => {
    if (listScope === "open") await loadOpen();
    else await loadClosed();
  }, [listScope, loadOpen, loadClosed]);

  useEffect(() => {
    if (!hydrated || !token) return;
    void load();
  }, [hydrated, token, listScope, load]);

  /* 킥오프 지난 경기는 목록에서 빠지므로 주기적으로 갱신 → 마감 탭으로 자연 이탈 */
  useEffect(() => {
    if (!hydrated || !token) return;
    const id = window.setInterval(() => {
      if (listScope === "open") void loadOpen();
      else void loadClosed();
    }, 45_000);
    return () => window.clearInterval(id);
  }, [hydrated, token, listScope, loadOpen, loadClosed]);

  useEffect(() => {
    setActiveLeague("전체");
  }, [listScope]);

  const sourceRows = listScope === "open" ? items : closedItems;

  /* 리그 목록 */
  const leagues = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = ["전체"];
    sourceRows.forEach((m) => {
      const key = m.league_name ?? m.sport_type ?? "기타";
      if (!seen.has(key)) { seen.add(key); list.push(key); }
    });
    return list;
  }, [sourceRows]);

  /** 메인 카드 `?preset=epl|nba|lck` → 리그 탭 자동 선택 (preset 바뀌면 다시 시도) */
  useEffect(() => {
    const raw = (searchParams.get("preset") || "").trim().toLowerCase();
    if (!raw) {
      presetAppliedFor.current = null;
      return;
    }
    if (leagues.length <= 1) return;
    if (presetAppliedFor.current === raw) return;
    const rest = leagues.filter((l) => l !== "전체");
    let hit: string | undefined;
    if (raw === "epl") {
      hit = rest.find((l) => /premier|epl|프리미어|프리미어리그/i.test(l));
    } else if (raw === "nba") {
      hit = rest.find((l) => /nba|농구|국바/i.test(l));
    } else if (raw === "lck") {
      hit = rest.find((l) => /lck|lol|e스포츠|e-스포츠|리그 오브 레전드/i.test(l));
    }
    if (hit) {
      setActiveLeague(hit);
      presetAppliedFor.current = raw;
    }
  }, [searchParams, leagues]);

  /* 필터된 경기 */
  const filtered = useMemo(() =>
    activeLeague === "전체"
      ? sourceRows
      : sourceRows.filter(
          (m) =>
            (m.league_name ?? m.sport_type ?? "기타") === activeLeague
        ),
    [sourceRows, activeLeague]
  );

  /* 슬립 토글 */
  function toggleSlip(m: SportsMatchRow, outcome: string, odds: string) {
    const oc = normOutcome(outcome);
    if (matchKickoffPassedClient(m.match_at)) return;
    setSlip((prev) => {
      const exists = prev.findIndex(
        (s) => s.matchId === m.id && normOutcome(s.outcome) === oc
      );
      if (exists >= 0) return prev.filter((_, i) => i !== exists);
      // 같은 경기 다른 결과 교체
      const filtered = prev.filter((s) => s.matchId !== m.id);
      return [
        ...filtered,
        {
          matchId: m.id,
          outcome: oc,
          odds,
          homeTeam: m.home_team,
          awayTeam: m.away_team,
        },
      ];
    });
  }

  /* 합산 배당 */
  const combinedOdds = useMemo(
    () =>
      slip
        .reduce((acc, s) => acc * parseFloat(s.odds), 1)
        .toFixed(2),
    [slip]
  );

  /* 예상 당첨금 */
  const expectedWin = useMemo(
    () =>
      Math.floor(parseFloat(stake || "0") * parseFloat(combinedOdds)),
    [stake, combinedOdds]
  );

  /* 베팅 제출 */
  async function onBet(e: React.FormEvent) {
    e.preventDefault();
    if (!token || slip.length === 0) return;
    for (const s of slip) {
      const row = items.find((x) => x.id === s.matchId);
      if (row && matchKickoffPassedClient(row.match_at)) {
        setErr("시간이 지난 경기가 포함되어 있습니다. 새로고침 후 다시 선택해 주세요.");
        setSlip((prev) => prev.filter((x) => x.matchId !== s.matchId));
        return;
      }
    }
    setSubmitting(true);
    setErr(null);
    setOkMsg(null);
    try {
      await placeSportsBet(
        token,
        stake.trim(),
        slip.map((s) => ({
          match_id: s.matchId,
          selected_outcome: s.outcome,
          odds_at_bet: s.odds,
        }))
      );
      setOkMsg(`베팅 완료! ${slip.length}폴더 × ${fmtMoney(stake)}원`);
      setSlip([]);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "베팅 실패");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── 렌더 ─────────────────────────────────────────── */
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <SiteHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-5">
        {/* 헤더 */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-premium">Sports</p>
            <h1 className="font-display text-2xl font-semibold text-slate-100" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              스포츠 토토
            </h1>
            <p className="mt-1 text-[11px] text-slate-600">
              경기 시각은 PC 설정과 관계없이 <strong className="text-slate-500">한국 표준시(KST)</strong>로 표시됩니다.
            </p>
          </div>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-300">← 메인</Link>
        </div>

        <MockSportsOddsPanel />

        {!hydrated ? (
          <p className="text-sm text-slate-500">불러오는 중…</p>
        ) : !token ? (
          <div className="glass-panel space-y-4 p-8 text-center">
            <p className="text-slate-400">로그인 후 이용할 수 있습니다.</p>
            <button
              onClick={() => openLogin()}
              className="min-h-[52px] w-full max-w-xs rounded-xl bg-gradient-to-r from-emerald-400 to-green-500 font-medium text-slate-950"
            >
              로그인
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row">
            {/* ── 왼쪽: 경기 목록 ───────────────────── */}
            <div className="min-w-0 flex-1 space-y-4">
              {/* 잔액 */}
              <div className="glass-panel flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <span className="text-slate-400">
                    보유 머니{" "}
                    <strong className="text-premium-glow">{fmtMoney(balance)}원</strong>
                  </span>
                  <p className="text-[11px] text-slate-600">
                    한국 현재 시각 <span className="font-mono text-slate-500">{kstNowLabel}</span> KST
                  </p>
                </div>
                <button
                  onClick={load}
                  className="min-h-[36px] shrink-0 rounded-lg border border-white/10 px-3 text-xs text-slate-400 hover:border-premium/30"
                >
                  새로고침
                </button>
              </div>

              {/* 알림 */}
              {err && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {err}
                </div>
              )}
              {okMsg && (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                  ✓ {okMsg}
                </div>
              )}

              <p className="rounded-xl border border-white/5 bg-slate-900/40 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
                <strong className="text-slate-400">왜 어드민 라이브 배당은 많은데 여기는 적나요?</strong> 관리자 화면은 The
                Odds API에서 바로 받은 전체 이벤트를 보여 주고, 플레이어는{" "}
                <span className="text-slate-400">DB에 동기화된 경기</span>만 표시합니다. 동기화(어드민
                스포츠 → The Odds API → 경기·배당 반영)를 주기적으로 실행하세요. 서버는 EPL·챔스·5대리그·K리그1·
                J리그·MLS·KBO·MLB·NHL·NFL 등 다수 리그를 피드에 포함합니다(리그당 경기 수 상한은 서버
                설정). 목록은 탭당 최대 약 150건까지 내려옵니다.
              </p>

              {/* 배팅 가능 / 마감·종료 */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setListScope("open")}
                  className={`min-h-[40px] flex-1 rounded-xl text-xs font-semibold transition sm:text-sm ${
                    listScope === "open"
                      ? "bg-premium text-slate-950"
                      : "border border-white/10 text-slate-400 hover:border-premium/30"
                  }`}
                >
                  배팅 가능
                </button>
                <button
                  type="button"
                  onClick={() => setListScope("closed")}
                  className={`min-h-[40px] flex-1 rounded-xl text-xs font-semibold transition sm:text-sm ${
                    listScope === "closed"
                      ? "bg-amber-500/90 text-slate-950"
                      : "border border-white/10 text-slate-400 hover:border-amber-500/40"
                  }`}
                >
                  마감·종료
                </button>
              </div>

              {/* 리그 탭 */}
              <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
                {leagues.map((lg) => (
                  <button
                    key={lg}
                    onClick={() => setActiveLeague(lg)}
                    className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition ${
                      activeLeague === lg
                        ? "bg-premium text-slate-950"
                        : "border border-white/10 text-slate-400 hover:border-premium/30"
                    }`}
                  >
                    {lg}
                  </button>
                ))}
              </div>

              {/* 경기 목록 */}
              {loading && sourceRows.length === 0 ? (
                <p className="text-sm text-slate-500">경기 목록 로딩…</p>
              ) : filtered.length === 0 ? (
                <div className="glass-panel p-8 text-center text-slate-500">
                  {listScope === "open"
                    ? "베팅 가능한 경기가 없습니다."
                    : "마감·종료로 분류된 경기가 없습니다."}
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((m) => {
                    if (listScope === "closed") {
                      const league = m.league_name ?? m.sport_type ?? "기타";
                      const emoji = SPORT_EMOJI[m.sport_type] ?? "🏅";
                      const rk = m.result ? normOutcome(m.result) : "";
                      const resLabel = rk ? RESULT_KO[rk] ?? m.result : null;
                      return (
                        <div key={m.id} className="glass-panel overflow-hidden px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span>{emoji}</span>
                            <span className="text-slate-500">{league}</span>
                            <span className="ml-auto font-mono text-slate-600">{fmtDateKst(m.match_at)}</span>
                            <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                              {m.status}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-medium text-slate-100">
                            {m.home_team}
                            <span className="mx-2 text-slate-600">vs</span>
                            {m.away_team}
                          </p>
                          {resLabel ? (
                            <p className="mt-1 text-[11px] text-amber-400/90">결과: {resLabel}</p>
                          ) : (
                            <p className="mt-1 text-[11px] text-slate-600">
                              {matchKickoffPassedClient(m.match_at) ? "경기 시작 후 마감 처리됨" : "—"}
                            </p>
                          )}
                        </div>
                      );
                    }
                    const league = m.league_name ?? m.sport_type ?? "기타";
                    const emoji = SPORT_EMOJI[m.sport_type] ?? "🏅";
                    const started = matchKickoffPassedClient(m.match_at);
                    return (
                      <div key={m.id} className="glass-panel overflow-hidden">
                        {/* 경기 헤더 */}
                        <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2">
                          <span className="text-base">{emoji}</span>
                          <span className="text-xs text-slate-500">{league}</span>
                          <span className="ml-auto text-xs text-slate-600">{fmtDateKst(m.match_at)}</span>
                          {started ? (
                            <span className="text-[10px] font-medium text-amber-500/90">마감</span>
                          ) : null}
                        </div>

                        {/* 팀 이름 */}
                        <div className="px-4 py-3">
                          <p className="text-sm font-medium text-slate-100">
                            {m.home_team}
                            <span className="mx-2 text-slate-600">vs</span>
                            {m.away_team}
                          </p>
                        </div>

                        {/* 승무패: 실제로 있는 결과만 열로 배치 (NBA=홈·원정 2열, 가운데 빈 칸 제거) */}
                        {(() => {
                          const h2hOrder = (["HOME_WIN", "DRAW", "AWAY_WIN"] as const).filter((oc) =>
                            m.odds?.some((x) => normOutcome(x.outcome) === oc)
                          );
                          const gridCls =
                            h2hOrder.length >= 3
                              ? "grid-cols-3"
                              : h2hOrder.length === 2
                                ? "grid-cols-2"
                                : "grid-cols-1";
                          return (
                            <div className={`grid ${gridCls} gap-0 border-t border-white/5`}>
                              {h2hOrder.map((oc) => {
                                const o = m.odds?.find((x) => normOutcome(x.outcome) === oc);
                                if (!o) return null;
                                const active = slip.some(
                                  (s) => s.matchId === m.id && normOutcome(s.outcome) === oc
                                );
                                return (
                                  <button
                                    key={oc}
                                    type="button"
                                    disabled={started}
                                    onClick={() => toggleSlip(m, oc, o.odds_value)}
                                    className={`flex flex-col items-center py-3 text-sm transition disabled:pointer-events-none disabled:opacity-35 ${
                                      active
                                        ? "bg-premium/20 text-premium"
                                        : "text-slate-300 hover:bg-white/5"
                                    }`}
                                  >
                                    <span className="text-[10px] text-slate-500">
                                      {OUT_LABEL[oc]}
                                    </span>
                                    <span className="mt-0.5 font-mono font-semibold">
                                      {parseFloat(o.odds_value).toFixed(2)}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}

                        {/* 핸디 · 언오버 — 데이터 없을 때도 영역 표시 (원인 안내) */}
                        {(() => {
                          const extra =
                            m.odds?.filter((x) => !H2H_KEYS.has(normOutcome(x.outcome))) ?? [];
                          return (
                            <div className="border-t border-white/5 px-2 py-2">
                              <p className="mb-1.5 px-2 text-[10px] text-slate-600">
                                핸디 · 언오버
                              </p>
                              {extra.length === 0 ? (
                                <p className="px-2 py-2 text-[11px] leading-relaxed text-slate-500">
                                  위 <span className="text-slate-400">승무패</span>만으로도 배팅할 수 있습니다.
                                  핸디·언오버(S_/T_)는 북·리전마다 API에 없을 수 있습니다. 서버 기본이{" "}
                                  <span className="text-slate-400">uk,eu</span> 리전이면 유럽·영국 북에서
                                  토탈/스프레드가 더 잘 붙습니다. 그래도 비면 어드민에서{" "}
                                  <span className="text-slate-400">The Odds API → 경기·배당 동기화</span>를
                                  한 번 더 실행한 뒤 새로고침하세요.
                                </p>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {extra.map((o) => {
                                    const ocKey = normOutcome(o.outcome);
                                    const active = slip.some(
                                      (s) =>
                                        s.matchId === m.id && normOutcome(s.outcome) === ocKey
                                    );
                                    return (
                                      <button
                                        key={ocKey}
                                        type="button"
                                        disabled={started}
                                        onClick={() =>
                                          toggleSlip(m, ocKey, o.odds_value)
                                        }
                                        className={`min-w-0 max-w-full rounded-lg border px-2.5 py-2 text-left text-xs transition disabled:pointer-events-none disabled:opacity-35 ${
                                          active
                                            ? "border-premium/50 bg-premium/15 text-premium"
                                            : "border-white/10 text-slate-300 hover:border-premium/20"
                                        }`}
                                      >
                                        <span className="block text-[10px] text-slate-500">
                                          {outcomeLabel(
                                            o.outcome,
                                            m.home_team,
                                            m.away_team
                                          )}
                                        </span>
                                        <span className="font-mono font-semibold">
                                          {parseFloat(o.odds_value).toFixed(2)}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── 오른쪽: 베팅슬립 (배팅 가능 탭만) ─────────────────── */}
            <div className="w-full lg:w-80 lg:shrink-0">
              <div className="sticky top-4 glass-panel space-y-4 p-5">
                {listScope === "closed" ? (
                  <div className="space-y-2 text-xs text-slate-500">
                    <p className="font-medium text-slate-400">마감·종료 탭</p>
                    <p>
                      이 탭은 조회 전용입니다. 킥오프가 지난 경기는 자동으로 여기로 분류되며, 약 45초마다
                      목록이 갱신됩니다.
                    </p>
                  </div>
                ) : (
                <>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-200">
                    베팅 슬립
                    {slip.length > 0 && (
                      <span className="ml-2 rounded-full bg-premium px-2 py-0.5 text-[10px] text-slate-950">
                        {slip.length}폴더
                      </span>
                    )}
                  </h2>
                  {slip.length > 0 && (
                    <button
                      onClick={() => setSlip([])}
                      className="text-xs text-slate-500 hover:text-red-400"
                    >
                      전체삭제
                    </button>
                  )}
                </div>

                {slip.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-600">
                    경기에서 배당을 선택하세요
                  </p>
                ) : (
                  <div className="space-y-2">
                    {slip.map((s) => (
                      <div
                        key={`${s.matchId}-${s.outcome}`}
                        className="flex items-start justify-between gap-2 rounded-lg border border-white/5 bg-slate-900/50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs text-slate-300">
                            {s.homeTeam} vs {s.awayTeam}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {outcomeLabel(
                              s.outcome,
                              s.homeTeam,
                              s.awayTeam
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-mono text-sm text-premium-glow">
                            {parseFloat(s.odds).toFixed(2)}
                          </span>
                          <button
                            onClick={() =>
                              setSlip((prev) =>
                                prev.filter(
                                  (x) =>
                                    !(
                                      x.matchId === s.matchId &&
                                      normOutcome(x.outcome) === normOutcome(s.outcome)
                                    )
                                )
                              )
                            }
                            className="text-slate-600 hover:text-red-400"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* 합산 배당 */}
                    <div className="rounded-lg border border-premium/20 bg-premium/5 px-3 py-2 text-sm">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>합산 배당</span>
                        <span className="font-mono text-premium-glow">{combinedOdds}</span>
                      </div>
                    </div>

                    {/* 베팅 폼 */}
                    <form onSubmit={onBet} className="space-y-3 pt-1">
                      <div>
                        <label className="mb-1 block text-xs text-slate-500">베팅 금액</label>
                        <input
                          type="number"
                          min="1000"
                          step="1000"
                          value={stake}
                          onChange={(e) => setStake(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-400/50"
                        />
                        {/* 빠른 금액 */}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {[10000, 50000, 100000].map((amt) => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => setStake(String(amt))}
                              className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-slate-400 hover:border-premium/30"
                            >
                              {fmtMoney(amt)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 예상 당첨금 */}
                      <div className="rounded-lg bg-slate-900/60 px-3 py-2 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span>예상 당첨금</span>
                          <span className="font-mono text-emerald-400">
                            {fmtMoney(expectedWin)}원
                          </span>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={submitting || slip.length === 0}
                        className="min-h-[48px] w-full rounded-xl bg-gradient-to-r from-emerald-400 to-green-500 font-medium text-slate-950 disabled:opacity-40"
                      >
                        {submitting ? "처리 중…" : `${slip.length}폴더 베팅하기`}
                      </button>
                    </form>
                  </div>
                )}
                </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function SportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col bg-[#060b14] text-slate-200">
          <SiteHeader />
          <main className="flex flex-1 items-center justify-center px-4 text-sm text-slate-500">
            스포츠 목록을 불러오는 중…
          </main>
        </div>
      }
    >
      <SportsPageInner />
    </Suspense>
  );
}
