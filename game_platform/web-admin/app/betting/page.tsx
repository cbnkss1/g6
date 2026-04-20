"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { KstDateRangeFields } from "@/components/admin/KstDateRangeFields";
import { kstDaysAgoYmd, kstTodayYmd } from "@/lib/formatKst";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";
import { useAdminDashboardSocket } from "@/hooks/useAdminDashboardSocket";
import { SwipeActionRow } from "@/components/admin/SwipeActionRow";

type LineRow = {
  bet_history_id: number;
  external_bet_uid: string;
  login_id: string;
  user_id: number;
  game_type: string;
  occurred_at: string | null;
  prev_balance: string;
  tx_amount: string;
  after_balance: string;
  line_kind: "bet" | "win" | "lose";
  line_label_ko: string;
};

const GAME_LABEL: Record<string, string> = {
  BACCARAT: "카지노",
  /** gp_bet_history 실제값 (Plxmed 콜백) — API에서 BACCARAT 필터와 함께 조회됨 */
  LIVE_CASINO: "라이브 카지노",
  CASINO: "카지노",
  SLOT: "슬롯",
  POWERBALL: "파워볼",
  SPORTS: "스포츠",
  TOTO: "토토",
};

const LINE_BADGE: Record<string, string> = {
  bet: "border-slate-600/60 bg-slate-800/50 text-slate-300",
  win: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  lose: "border-red-500/40 bg-red-500/10 text-red-300",
};

function fmtDtFull(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function fmtNum(s: string) {
  if (!s || s === "") return "—";
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return n.toLocaleString();
}

export default function BettingLogsPage() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const url = useSearchParams();
  const urlGameType = useMemo(() => {
    const raw = url.get("game_type");
    return raw?.trim() ? raw.trim().toUpperCase() : "";
  }, [url]);
  const [loginFilter, setLoginFilter] = useState("");
  const [gameType, setGameType] = useState(urlGameType);
  const [gameResult, setGameResult] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const kstDefault = useMemo(() => ({ from: kstDaysAgoYmd(6), to: kstTodayYmd() }), []);
  const [dateFrom, setDateFrom] = useState(kstDefault.from);
  const [dateTo, setDateTo] = useState(kstDefault.to);
  const [applied, setApplied] = useState(() => ({
    login: "",
    gt: urlGameType,
    gr: "",
    min: "",
    df: kstDefault.from,
    dt: kstDefault.to,
  }));

  useEffect(() => {
    if (!urlGameType) return;
    setGameType(urlGameType);
    setApplied((prev) => ({ ...prev, gt: urlGameType }));
  }, [urlGameType]);

  useAdminDashboardSocket({
    onExtraMessage: (msg) => {
      if (msg.type === "bet_log") qc.invalidateQueries({ queryKey: ["admin", "bets"] });
    },
  });

  const q = useQuery({
    queryKey: ["admin", "bets", "history-lines", token ?? "", applied],
    queryFn: async () => {
      const base = publicApiBase();
      if (!base || !token) throw new Error("no token");
      const p = new URLSearchParams();
      if (applied.login.trim()) p.set("login_id", applied.login.trim());
      if (applied.gt.trim()) p.set("game_type", applied.gt.trim());
      if (applied.gr.trim()) p.set("game_result", applied.gr.trim());
      if (applied.min.trim()) p.set("min_amount", applied.min.trim());
      if (applied.df.trim()) p.set("date_from", applied.df.trim());
      if (applied.dt.trim()) p.set("date_to", applied.dt.trim());
      p.set("bet_limit", "100");
      p.set("line_limit", "250");
      const r = await fetch(`${base}/admin/bets/history-lines?${p.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`history-lines ${r.status}`);
      const data = (await r.json()) as { items: LineRow[]; returned_lines: number };
      return data;
    },
    enabled: Boolean(token),
    refetchInterval: 30_000,
  });

  const lines = useMemo(() => q.data?.items ?? [], [q.data?.items]);

  const stats = useMemo(() => {
    let bet = 0,
      win = 0,
      lose = 0,
      stakeSum = 0;
    for (const r of lines) {
      if (r.line_kind === "bet") {
        bet++;
        stakeSum += Number(r.tx_amount) || 0;
      }
      if (r.line_kind === "win") win++;
      if (r.line_kind === "lose") lose++;
    }
    return { bet, win, lose, stakeSum };
  }, [lines]);

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-premium-label">배팅 통합 로그</p>
          <h2
            className="mt-1 text-2xl font-semibold text-slate-100"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            배팅 내역
          </h2>
          <p className="text-xs text-slate-600">
            베팅 시점·이전 잔고·거래 금액·이후 잔고·구분(베팅/당첨/낙첨) — 게임머니 원장 기준
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            { label: `${lines.length}줄`, color: "text-slate-300", bg: "bg-slate-800/60" },
            { label: `베팅 ${stats.bet}`, color: "text-slate-400", bg: "bg-slate-800/40" },
            { label: `당첨 ${stats.win}`, color: "text-emerald-400", bg: "bg-emerald-500/10" },
            { label: `낙첨 ${stats.lose}`, color: "text-red-400", bg: "bg-red-500/10" },
          ].map((c) => (
            <span
              key={c.label}
              className={`rounded-full border border-current/20 px-2.5 py-1 font-medium ${c.color} ${c.bg}`}
            >
              {c.label}
            </span>
          ))}
        </div>
      </div>

      <div className="glass-card-sm flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <KstDateRangeFields
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
        />
        {[
          { label: "아이디", value: loginFilter, set: setLoginFilter, placeholder: "부분 검색", type: "text" },
          { label: "최소 배팅액", value: minAmount, set: setMinAmount, placeholder: "0", type: "decimal" },
        ].map((f) => (
          <label key={f.label} className="flex min-w-[120px] flex-1 flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-widest text-slate-600">{f.label}</span>
            <input
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              placeholder={f.placeholder}
              inputMode={f.type as "text" | "decimal"}
              className="admin-touch-input rounded-xl border border-slate-800 bg-slate-950/80 px-4 text-sm text-slate-100 outline-none transition focus:border-premium/40 focus:shadow-[0_0_12px_rgba(212,175,55,0.15)]"
            />
          </label>
        ))}
        {[
          {
            label: "게임",
            value: gameType,
            set: setGameType,
            opts: [
              ["", "전체"],
              ["BACCARAT", "바카라"],
              ["SLOT", "슬롯"],
              ["POWERBALL", "파워볼"],
              ["SPORTS", "스포츠"],
            ],
          },
          {
            label: "결과(건)",
            value: gameResult,
            set: setGameResult,
            opts: [
              ["", "전체"],
              ["WIN", "WIN"],
              ["LOSE", "LOSE"],
              ["TIE", "TIE"],
              ["VOID", "VOID"],
            ],
          },
        ].map((f) => (
          <label key={f.label} className="flex min-w-[100px] flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-widest text-slate-600">{f.label}</span>
            <select
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              className="admin-touch-input rounded-xl border border-slate-800 bg-slate-950/80 px-3 text-sm text-slate-100 outline-none focus:border-premium/40"
            >
              {f.opts.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button
          onClick={() =>
            setApplied({
              login: loginFilter,
              gt: gameType,
              gr: gameResult,
              min: minAmount,
              df: dateFrom,
              dt: dateTo,
            })
          }
          className="admin-touch-btn rounded-xl px-6 text-sm font-semibold text-slate-950 transition-all hover:shadow-glow-gold"
          style={{ background: "linear-gradient(135deg, #d4af37, #f0e2a8, #8a7530)" }}
        >
          검색
        </button>
      </div>

      {lines.length > 0 && (
        <div className="glass-card-sm flex items-center gap-4 px-4 py-3">
          <p className="shrink-0 text-[10px] uppercase tracking-widest text-slate-600">베팅 줄 합계(금액)</p>
          <p className="font-bold tabular-nums text-premium">
            {stats.stakeSum.toLocaleString()} <span className="text-xs font-normal text-slate-600">GM</span>
          </p>
        </div>
      )}

      {q.isLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 rounded-xl shimmer" />
          ))}
        </div>
      )}

      {!q.isLoading && lines.length === 0 && (
        <div
          className="rounded-2xl py-16 text-center glass-card-sm"
          style={{
            border: "1px solid rgba(212,175,55,0.12)",
          }}
        >
          <p className="mb-3 text-3xl">🎲</p>
          <p className="text-sm text-slate-500">표시할 내역이 없습니다.</p>
        </div>
      )}

      {!q.isLoading && lines.length > 0 && (
        <div className="space-y-2 md:hidden">
          {lines.slice(0, 60).map((row, i) => (
            <SwipeActionRow
              key={`${row.bet_history_id}-${row.line_kind}-${row.occurred_at ?? i}`}
              onDetail={() =>
                window.alert(`상세\n${row.login_id}\n${row.external_bet_uid}\n${fmtDtFull(row.occurred_at)}`)
              }
              onSanction={() => window.alert("제재는 회원 관리 메뉴와 연동 예정입니다.")}
            >
              <div
                className="rounded-xl border border-slate-800/80 px-3 py-3"
                style={{ background: "rgba(8,15,28,0.92)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-200">{row.login_id}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${LINE_BADGE[row.line_kind] ?? LINE_BADGE.bet}`}
                  >
                    {row.line_label_ko}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-slate-600">{fmtDtFull(row.occurred_at)}</p>
                <p className="mt-1 text-sm tabular-nums text-slate-300">
                  {GAME_LABEL[row.game_type] ?? row.game_type} ·{" "}
                  <span className="font-semibold text-slate-100">{fmtNum(row.tx_amount)}</span>
                </p>
              </div>
            </SwipeActionRow>
          ))}
        </div>
      )}

      {!q.isLoading && lines.length > 0 && (
        <div
          className="hidden overflow-x-auto rounded-2xl md:block"
          style={{
            border: "1px solid rgba(212,175,55,0.12)",
            background: "rgba(8,15,28,0.85)",
            backdropFilter: "blur(12px)",
          }}
        >
            <table className="w-full min-w-[860px] border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-800/80 text-[10px] uppercase tracking-wider text-slate-500 sm:text-[11px]">
                  <th className="whitespace-nowrap px-3 py-3 font-medium">배팅시간</th>
                  <th className="whitespace-nowrap px-3 py-3 font-medium">아이디</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-medium">이전금액</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-medium">거래금액</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right font-medium">이후금액</th>
                  <th className="whitespace-nowrap px-3 py-3 font-medium">구분</th>
                  <th className="whitespace-nowrap px-3 py-3 font-medium">게임</th>
                  <th className="whitespace-nowrap px-3 py-3 font-medium text-slate-600">참조</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((row, i) => (
                  <tr
                    key={`${row.bet_history_id}-${row.line_kind}-${row.occurred_at ?? i}`}
                    className="border-b border-slate-800/40 hover:bg-slate-800/25"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-400 tabular-nums">
                      {fmtDtFull(row.occurred_at)}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-200">{row.login_id}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{fmtNum(row.prev_balance)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-100">
                      {fmtNum(row.tx_amount)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{fmtNum(row.after_balance)}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${LINE_BADGE[row.line_kind] ?? LINE_BADGE.bet}`}
                      >
                        {row.line_label_ko}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">{GAME_LABEL[row.game_type] ?? row.game_type}</td>
                    <td className="max-w-[140px] truncate px-3 py-2.5 font-mono text-[10px] text-slate-600">
                      {row.external_bet_uid}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
      )}
    </div>
  );
}
