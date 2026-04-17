"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";
import { useAdminDashboardSocket } from "@/hooks/useAdminDashboardSocket";
import { MockSportsOddsPanel } from "@/components/admin/MockSportsOddsPanel";
import { SlideToSettle } from "@/components/admin/SlideToSettle";

// ─── 타입 ────────────────────────────────────────────────────────────────────
type OddsRow = { outcome: string; odds_value: string };
type MatchRow = {
  id: number;
  external_match_id: string;
  sport_type: string;
  league_name: string | null;
  home_team: string;
  away_team: string;
  match_at: string | null;
  status: string;
  result: string | null;
  home_score: number | null;
  away_score: number | null;
  settled_at: string | null;
  odds: OddsRow[];
};
type SlipRow = { id: number; match_id: number; selected_outcome: string; odds_at_bet: string; result: string };
type BetRow = {
  id: number; user_id: number; stake: string; combined_odds: string;
  potential_win: string; status: string; win_amount: string | null; slips: SlipRow[];
};

// ─── 포맷 헬퍼 ───────────────────────────────────────────────────────────────
function fmtMoney(v: string | number | null | undefined): string {
  if (v == null) return "-";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString("ko-KR");
}
function fmtDt(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_BADGE: Record<string, string> = {
  OPEN:      "bg-emerald-500/20 text-emerald-300",
  CLOSED:    "bg-amber-500/20 text-amber-300",
  SETTLED:   "bg-slate-700/60 text-slate-400",
  CANCELLED: "bg-red-500/20 text-red-400",
};

const RESULT_OPTIONS = [
  { value: "HOME_WIN",   label: "홈 승" },
  { value: "DRAW",       label: "무승부" },
  { value: "AWAY_WIN",   label: "원정 승" },
  { value: "CANCELLED",  label: "취소 (적특)" },
  { value: "POSTPONED",  label: "연기 (적특)" },
];

function oddsShortLabel(outcome: string): string {
  const o = outcome.toUpperCase();
  const tm = /^T_([OU])_(\d+)_(\d)$/.exec(o);
  if (tm) {
    const line = `${tm[2]}.${tm[3]}`;
    return tm[1] === "O" ? `오버 ${line}` : `언더 ${line}`;
  }
  const sm = /^S_([HA])_([MP])(\d+)_(\d)$/.exec(o);
  if (sm) {
    const sign = sm[2] === "M" ? "-" : "+";
    return `핸디${sm[1] === "H" ? "홈" : "원"} ${sign}${sm[3]}.${sm[4]}`;
  }
  if (o === "HOME_WIN") return "홈승";
  if (o === "AWAY_WIN") return "원정승";
  if (o === "DRAW") return "무";
  return o;
}

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────
export default function SportsSettlementPage() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const base = publicApiBase();
  const headers = { Authorization: `Bearer ${token}` };

  const [statusFilter, setStatusFilter] = useState("CLOSED");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedBets, setExpandedBets] = useState<Record<number, BetRow[]>>({});
  const [loadingBets, setLoadingBets] = useState<number | null>(null);
  const [settleResult, setSettleResult] = useState<Record<number, string>>({});
  const [settleHomeScore, setSettleHomeScore] = useState<Record<number, string>>({});
  const [settleAwayScore, setSettleAwayScore] = useState<Record<number, string>>({});
  const [settleMsg, setSettleMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [bulkMsg, setBulkMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [syncMsg, setSyncMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [syncForceApi, setSyncForceApi] = useState(false);
  const [flashSettled, setFlashSettled] = useState<Set<number>>(new Set());

  // WS — 정산 완료 시 목록 갱신
  useAdminDashboardSocket({
    onExtraMessage: (msg) => {
      if (msg.type === "settlement") {
        qc.invalidateQueries({ queryKey: ["sports-matches"] });
        qc.invalidateQueries({ queryKey: ["sports-summary"] });
        const mid = msg.payload?.match_id;
        const matchId = typeof mid === "number" ? mid : Number(mid);
        if (Number.isFinite(matchId)) {
          setFlashSettled((prev) => new Set([...Array.from(prev), matchId]));
          setTimeout(
            () =>
              setFlashSettled((prev) => {
                const s = new Set(prev);
                s.delete(matchId);
                return s;
              }),
            3000,
          );
        }
      }
    },
  });

  // ── 데이터 조회 ────────────────────────────────────────────────────────────
  const { data: summaryData } = useQuery({
    queryKey: ["sports-summary"],
    queryFn: async () => {
      const r = await fetch(`${base}/admin/sports/pending-summary`, { headers });
      return await r.json();
    },
    enabled: !!token,
    refetchInterval: 15000,
  });

  const { data: matchesData, isLoading } = useQuery({
    queryKey: ["sports-matches", statusFilter],
    queryFn: async () => {
      const p = new URLSearchParams({ limit: "100" });
      if (statusFilter) p.set("status", statusFilter);
      const r = await fetch(`${base}/admin/sports/matches?${p}`, { headers });
      return (await r.json()) as { items: MatchRow[] };
    },
    enabled: !!token,
    refetchInterval: 30000,
  });

  // ── 배팅 현황 로드 ─────────────────────────────────────────────────────────
  async function loadBets(matchId: number) {
    if (expandedBets[matchId]) { setExpandedId(expandedId === matchId ? null : matchId); return; }
    setLoadingBets(matchId);
    try {
      const r = await fetch(`${base}/admin/sports/matches/${matchId}/bets?limit=100`, { headers });
      const d = await r.json();
      setExpandedBets(prev => ({ ...prev, [matchId]: d.bets || [] }));
      setExpandedId(matchId);
    } finally {
      setLoadingBets(null);
    }
  }

  // ── 트랙 A: 개별 정산 ─────────────────────────────────────────────────────
  const settleSingle = useMutation({
    mutationFn: async ({
      matchId,
      result,
      homeScore,
      awayScore,
    }: {
      matchId: number;
      result: string;
      homeScore?: number;
      awayScore?: number;
    }) => {
      const body: Record<string, unknown> = { result };
      if (homeScore != null && awayScore != null) {
        body.home_score = homeScore;
        body.away_score = awayScore;
      }
      const r = await fetch(`${base}/admin/sports/matches/${matchId}/settle`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? "정산 실패");
      return d;
    },
    onSuccess: (d) => {
      setSettleMsg({
        type: "ok",
        text: `✓ 정산 완료: 처리 ${d.bets_processed}건, 당첨지급 ${fmtMoney(d.total_payout)}원`,
      });
      qc.invalidateQueries({ queryKey: ["sports-matches"] });
      qc.invalidateQueries({ queryKey: ["sports-summary"] });
    },
    onError: (e: Error) => setSettleMsg({ type: "err", text: e.message }),
  });

  // ── 트랙 B: 한방 일괄 정산 ────────────────────────────────────────────────
  const bulkSettle = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${base}/admin/sports/bulk-settle`, {
        method: "POST", headers,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? "한방 정산 실패");
      return d;
    },
    onSuccess: (d) => {
      setBulkMsg({
        type: "ok",
        text: `✓ 한방 정산 완료: ${d.matches_processed}경기, 배팅 ${d.total_bets}건, 지급 ${fmtMoney(d.total_payout)}원`,
      });
      qc.invalidateQueries({ queryKey: ["sports-matches"] });
      qc.invalidateQueries({ queryKey: ["sports-summary"] });
    },
    onError: (e: Error) => setBulkMsg({ type: "err", text: e.message }),
  });

  const syncFromOdds = useMutation({
    mutationFn: async (forceRefresh: boolean) => {
      const q = new URLSearchParams({ force_refresh: forceRefresh ? "true" : "false" });
      const r = await fetch(`${base}/admin/sports/matches/sync-from-odds-api?${q}`, {
        method: "POST",
        headers,
      });
      const j = (await r.json().catch(() => ({}))) as { detail?: string; created?: number; updated?: number; skipped_has_bets?: number; skipped_closed?: number };
      if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : r.statusText);
      return j;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["sports-matches"] });
      setSyncMsg({
        type: "ok",
        text: `신규 ${data.created ?? 0} · 갱신 ${data.updated ?? 0} · 배팅있음 스킵 ${data.skipped_has_bets ?? 0} · 비OPEN 스킵 ${data.skipped_closed ?? 0}`,
      });
    },
    onError: (e: Error) => setSyncMsg({ type: "err", text: e.message }),
  });

  const matches = matchesData?.items ?? [];
  const summary = summaryData;

  return (
    <div className="mx-auto max-w-4xl space-y-5 animate-fade-up">
      {/* 헤더 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-premium-label">스포츠 정산 센터</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-100"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            듀얼 트랙 정산 시스템
          </h1>
          <p className="text-[10px] text-slate-600 mt-0.5">TIE 제외 · R-스냅샷 · 원자적 트랜잭션</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => syncFromOdds.mutate(syncForceApi)}
            disabled={syncFromOdds.isPending || !token}
            className="admin-touch-btn min-h-[52px] rounded-full border border-sky-500/35 bg-sky-500/10 px-4 text-xs font-semibold text-sky-200 hover:bg-sky-500/20 disabled:opacity-40"
          >
            {syncFromOdds.isPending ? "동기화 중…" : "Odds API → 경기·배당 반영"}
          </button>
          <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-slate-500">
            <input
              type="checkbox"
              checked={syncForceApi}
              onChange={(e) => setSyncForceApi(e.target.checked)}
              className="rounded border-slate-600"
            />
            캐시 무시(쿼터 소모)
          </label>
          <Link
            href="/league-hub/odds-live"
            className="admin-touch-btn rounded-full border border-premium/35 bg-premium/10 px-4 text-xs font-semibold text-premium hover:bg-premium/20"
          >
            라이브 배당 (Odds API)
          </Link>
          {["OPEN", "CLOSED", "SETTLED", ""].map(s => (
            <button key={s}
              onClick={() => setStatusFilter(s)}
              className={`admin-touch-btn rounded-full border px-3 text-xs font-semibold transition-all ${
                statusFilter === s
                  ? "border-premium bg-premium/12 text-premium"
                  : "border-slate-800 text-slate-500 hover:border-slate-600"
              }`}
            >
              {s || "전체"}
            </button>
          ))}
        </div>
      </div>

      <MockSportsOddsPanel />

      {syncMsg && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            syncMsg.type === "ok"
              ? "border-sky-500/20 bg-sky-950/20 text-sky-200"
              : "border-red-500/20 bg-red-950/20 text-red-400"
          }`}
        >
          {syncMsg.type === "ok" ? "✓ " : "✕ "}
          {syncMsg.text}
          <button
            type="button"
            onClick={() => setSyncMsg(null)}
            className="ml-3 text-xs opacity-50 hover:opacity-100"
          >
            닫기
          </button>
        </div>
      )}

      {/* 상단 요약 카드 */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "정산 대기 경기", value: summary.pending_matches, unit: "경기", color: "#d4af37", icon: "⏳" },
            { label: "대기 배팅", value: fmtMoney(summary.pending_bets), unit: "건", color: "#94a3b8", icon: "◆" },
            { label: "대기 배팅액", value: fmtMoney(summary.pending_stake), unit: "원", color: "#60a5fa", icon: "$" },
            { label: "최대 지급 예상", value: fmtMoney(summary.max_potential_payout), unit: "원", color: "#f87171", icon: "↑" },
          ].map(c => (
            <div key={c.label} className="glass-card-sm flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-medium uppercase tracking-widest text-slate-600">{c.label}</p>
                <span style={{ color: c.color }} className="text-sm">{c.icon}</span>
              </div>
              <p className="text-xl font-bold tabular-nums" style={{ color: c.color }}>
                {c.value}
                <span className="ml-1 text-[10px] font-normal text-slate-600">{c.unit}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* 트랙 B: 한방 정산 슬라이더 */}
      <div className="glass-card space-y-4 p-5"
        style={{ borderColor: "rgba(212,175,55,0.2)" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-premium-label">Track B · 한방 일괄 정산</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-200">
              CLOSED 경기 원자적 일괄 처리
            </p>
            <p className="text-[10px] text-slate-600">1건 실패 시 전체 롤백 보장</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${
            (summary?.pending_matches ?? 0) > 0
              ? "border-amber-500/30 bg-amber-500/12 text-amber-300"
              : "border-slate-700 bg-slate-800 text-slate-600"
          }`}>
            {summary?.pending_matches ?? 0}경기 대기
          </span>
        </div>
        <SlideToSettle
          label={`밀어서 한방 정산 (${summary?.pending_matches ?? 0}경기)`}
          onConfirm={() => bulkSettle.mutate()}
          loading={bulkSettle.isPending}
          disabled={(summary?.pending_matches ?? 0) === 0}
        />
        {bulkMsg && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${
            bulkMsg.type === "ok"
              ? "border-emerald-500/20 bg-emerald-950/20 text-emerald-300"
              : "border-red-500/20 bg-red-950/20 text-red-400"
          }`}>
            {bulkMsg.type === "ok" ? "✓ " : "✕ "}{bulkMsg.text}
          </div>
        )}
      </div>

      {/* 정산 결과 메시지 */}
      {settleMsg && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-center justify-between ${
          settleMsg.type === "ok"
            ? "border-emerald-500/20 bg-emerald-950/20 text-emerald-300"
            : "border-red-500/20 bg-red-950/20 text-red-400"
        }`}>
          <span>{settleMsg.type === "ok" ? "✓ " : "✕ "}{settleMsg.text}</span>
          <button onClick={() => setSettleMsg(null)} className="text-xs opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      {/* 경기 목록 */}
      {isLoading && (
        <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="shimmer h-20 rounded-2xl"/>)}</div>
      )}
      {!isLoading && matches.length === 0 && (
        <div className="glass-card py-16 text-center">
          <p className="text-4xl mb-3">⚽</p>
          <p className="text-slate-600 text-sm">경기 없음</p>
        </div>
      )}

      <div className="space-y-3">
        {matches.map(match => {
          const isExpanded = expandedId === match.id;
          const bets = expandedBets[match.id] ?? [];
          const isFlash = flashSettled.has(match.id);
          const canSettle = match.status === "CLOSED" || match.status === "OPEN";

          return (
            <div key={match.id}
              className={`overflow-hidden rounded-2xl transition-all duration-500 ${isFlash ? "glow-flash-emerald" : ""}`}
              style={{
                background: "rgba(8,15,28,0.85)",
                backdropFilter: "blur(12px)",
                border: isFlash
                  ? "1px solid rgba(52,211,153,0.4)"
                  : `1px solid ${match.status === "SETTLED" ? "rgba(51,65,85,0.3)" : "rgba(212,175,55,0.12)"}`,
              }}
            >
              {/* 경기 헤더 */}
              <div className="p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[match.status] ?? ""}`}>
                        {match.status}
                      </span>
                      <span className="text-[10px] text-slate-600 uppercase tracking-wide">{match.sport_type}</span>
                      {match.league_name && (
                        <span className="text-[10px] text-slate-700">{match.league_name}</span>
                      )}
                      {isFlash && (
                        <span className="animate-pulse rounded-full bg-emerald-400 px-2 py-0.5 text-[9px] font-bold text-slate-950">
                          ✓ 정산완료
                        </span>
                      )}
                    </div>
                    {/* 팀 대결 */}
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-slate-100 text-base">{match.home_team}</span>
                      <span className="text-premium text-xs font-semibold">vs</span>
                      <span className="font-bold text-slate-100 text-base">{match.away_team}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-[10px] text-slate-600">{fmtDt(match.match_at)}</p>
                      {match.result && (
                        <span className="rounded-full bg-premium/15 border border-premium/25 px-2 py-0.5 text-[10px] font-semibold text-premium">
                          {match.result}
                        </span>
                      )}
                      {match.home_score != null && match.away_score != null && (
                        <span className="text-[10px] text-slate-500">
                          스코어 {match.home_score} : {match.away_score}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 배당 */}
                  {match.odds.length > 0 && (
                    <div className="flex max-w-[min(100%,420px)] flex-wrap justify-end gap-1.5">
                      {match.odds.map(o => (
                        <div key={o.outcome}
                          className="flex flex-col items-center gap-0.5 rounded-xl border border-slate-800/80 bg-slate-900/50 px-2 py-1.5 min-w-[48px]"
                        >
                          <p className="max-w-[5.5rem] text-center text-[8px] font-medium leading-tight text-slate-600">
                            {oddsShortLabel(o.outcome)}
                          </p>
                          <p className="text-sm font-bold text-premium">{o.odds_value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 트랙 A */}
                {canSettle && (
                  <div className="mt-3 flex flex-col gap-2">
                    <p className="text-[10px] text-slate-600">
                      언오버·핸디 베팅이 있으면 홈/원정 스코어(정수)를 모두 입력해야 정산됩니다.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={settleResult[match.id] ?? ""}
                      onChange={e => setSettleResult(p => ({ ...p, [match.id]: e.target.value }))}
                      className="admin-touch-input flex-1 min-w-[140px] rounded-xl border border-slate-800 bg-slate-950/70 px-3 text-sm text-slate-200 outline-none focus:border-premium/30"
                    >
                      <option value="">-- 결과 선택 --</option>
                      {RESULT_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="홈 득점"
                      value={settleHomeScore[match.id] ?? ""}
                      onChange={e =>
                        setSettleHomeScore(p => ({ ...p, [match.id]: e.target.value }))
                      }
                      className="admin-touch-input w-[88px] rounded-xl border border-slate-800 bg-slate-950/70 px-2 py-2 text-sm text-slate-200 outline-none focus:border-premium/30"
                    />
                    <input
                      type="number"
                      placeholder="원정 득점"
                      value={settleAwayScore[match.id] ?? ""}
                      onChange={e =>
                        setSettleAwayScore(p => ({ ...p, [match.id]: e.target.value }))
                      }
                      className="admin-touch-input w-[88px] rounded-xl border border-slate-800 bg-slate-950/70 px-2 py-2 text-sm text-slate-200 outline-none focus:border-premium/30"
                    />
                    <button
                      onClick={() => {
                        const r = settleResult[match.id];
                        if (!r) return;
                        const hs = settleHomeScore[match.id]?.trim() ?? "";
                        const aws = settleAwayScore[match.id]?.trim() ?? "";
                        let homeScore: number | undefined;
                        let awayScore: number | undefined;
                        if (hs !== "" || aws !== "") {
                          const hi = parseInt(hs, 10);
                          const ai = parseInt(aws, 10);
                          if (Number.isNaN(hi) || Number.isNaN(ai)) {
                            setSettleMsg({
                              type: "err",
                              text: "스코어는 홈·원정 모두 정수로 입력하세요.",
                            });
                            return;
                          }
                          homeScore = hi;
                          awayScore = ai;
                        }
                        settleSingle.mutate({
                          matchId: match.id,
                          result: r,
                          homeScore,
                          awayScore,
                        });
                      }}
                      disabled={!settleResult[match.id] || settleSingle.isPending}
                      className="admin-touch-btn rounded-xl px-4 text-sm font-bold text-slate-950 transition-all hover:opacity-90 disabled:opacity-40"
                      style={{ background: "linear-gradient(135deg, #d4af37, #f0e2a8, #8a7530)" }}
                    >
                      {settleSingle.isPending ? "…" : "Track A 정산"}
                    </button>
                    <button
                      onClick={() => loadBets(match.id)}
                      className="admin-touch-btn rounded-xl border border-slate-800 px-3 text-xs text-slate-500 hover:border-premium/30 hover:text-premium transition-all"
                    >
                      {loadingBets === match.id ? "로드 중…" : isExpanded ? "▲ 닫기" : "▼ 배팅"}
                    </button>
                    </div>
                  </div>
                )}
                {match.status === "SETTLED" && (
                  <button
                    onClick={() => loadBets(match.id)}
                    className="mt-2 admin-touch-btn rounded-xl border border-slate-800 px-3 text-xs text-slate-500 hover:text-premium transition-all"
                  >
                    {isExpanded ? "▲ 배팅 숨기기" : "▼ 배팅 내역"}
                  </button>
                )}
              </div>

              {/* Accordion */}
              {isExpanded && (
                <div
                  className="border-t px-4 pb-4 pt-3"
                  style={{ borderColor: "rgba(212,175,55,0.1)" }}
                >
                  <p className="text-premium-label mb-3">배팅 내역 ({bets.length}건)</p>
                  {bets.length === 0 && (
                    <p className="py-4 text-center text-xs text-slate-700">배팅 없음</p>
                  )}
                  <div className="space-y-2">
                    {bets.map(bet => {
                      const betStatusColor: Record<string, string> = {
                        PENDING: "border-amber-500/25 text-amber-400 bg-amber-500/8",
                        WON: "border-emerald-500/25 text-emerald-300 bg-emerald-500/8",
                        LOST: "border-red-500/25 text-red-400 bg-red-500/8",
                        VOIDED: "border-slate-700 text-slate-600 bg-slate-800/40",
                        CANCELLED: "border-slate-700 text-slate-600 bg-slate-800/40",
                        PARTIAL_VOID: "border-orange-500/25 text-orange-400 bg-orange-500/8",
                      };
                      const bStyle = betStatusColor[bet.status] ?? "border-slate-700 text-slate-400";

                      return (
                        <div key={bet.id} className={`rounded-xl border p-3 space-y-2 ${bStyle}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] text-slate-600 font-mono">#{bet.id}</span>
                              <span className="text-xs font-bold">{bet.status}</span>
                              <span className="text-xs text-slate-500">
                                {fmtMoney(bet.stake)}원 × <span className="text-premium">{bet.combined_odds}배</span>
                              </span>
                            </div>
                            {bet.win_amount && Number(bet.win_amount) > 0 && (
                              <span className="font-bold text-sm text-emerald-300">
                                ✓ {fmtMoney(bet.win_amount)}원
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {bet.slips.map(s => {
                              const slipColor: Record<string, string> = {
                                WON: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
                                LOST: "bg-red-500/15 border-red-500/30 text-red-400",
                                VOID: "bg-slate-700/30 border-slate-700 text-slate-500",
                                TIE: "bg-blue-500/15 border-blue-500/30 text-blue-300",
                                PENDING: "bg-amber-500/10 border-amber-500/20 text-amber-400",
                              };
                              return (
                                <span key={s.id}
                                  className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${slipColor[s.result] ?? "bg-slate-800 border-slate-700 text-slate-500"}`}
                                >
                                  {s.selected_outcome} @{s.odds_at_bet} → {s.result}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
