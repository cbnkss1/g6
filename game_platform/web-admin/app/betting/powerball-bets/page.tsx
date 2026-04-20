"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { KstDateRangeFields } from "@/components/admin/KstDateRangeFields";
import { adminFetch } from "@/lib/adminFetch";
import { kstDaysAgoYmd, kstTodayYmd } from "@/lib/formatKst";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type BetRow = {
  id: number;
  user_id: number;
  login_id: string;
  game_key: string;
  round_no: number;
  pick: string;
  amount: string;
  odds: string;
  status: string;
  payout: string | null;
  created_at: string | null;
  settled_at: string | null;
};

function fmtDt(iso: string | null) {
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

export default function PowerballBettingHistoryPage() {
  const token = useAuthStore((s) => s.token);
  const kd = useMemo(() => ({ from: kstDaysAgoYmd(6), to: kstTodayYmd() }), []);
  const [loginFilter, setLoginFilter] = useState("");
  const [userId, setUserId] = useState("");
  const [gameKey, setGameKey] = useState("");
  const [dateFrom, setDateFrom] = useState(kd.from);
  const [dateTo, setDateTo] = useState(kd.to);
  const [offset, setOffset] = useState(0);
  const limit = 80;

  const applied = useMemo(
    () => ({
      login: loginFilter.trim(),
      uid: userId.trim(),
      gk: gameKey.trim(),
      offset,
      df: dateFrom,
      dt: dateTo,
    }),
    [loginFilter, userId, gameKey, offset, dateFrom, dateTo],
  );

  const q = useQuery({
    queryKey: ["admin", "powerball", "bets-list", token ?? "", applied],
    queryFn: async () => {
      const base = publicApiBase();
      if (!base || !token) throw new Error("no token");
      const p = new URLSearchParams();
      p.set("limit", String(limit));
      p.set("offset", String(applied.offset));
      if (applied.login) p.set("login_id", applied.login);
      if (applied.uid) {
        const n = Number.parseInt(applied.uid, 10);
        if (Number.isFinite(n) && n > 0) p.set("user_id", String(n));
      }
      if (applied.gk) p.set("game_key", applied.gk);
      p.set("date_from", applied.df);
      p.set("date_to", applied.dt);
      const r = await adminFetch(`${base}/admin/powerball/bets?${p}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as { items: BetRow[]; offset: number; limit: number };
    },
    enabled: Boolean(token),
    retry: 0,
  });

  const items = q.data?.items ?? [];
  const canLoadMore = items.length >= limit;

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-premium-label">내역</p>
          <h1
            className="mt-1 text-2xl font-semibold text-slate-100"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            파워볼 배팅 내역
          </h1>
          <p className="mt-1 text-xs text-slate-600">
            코인파워볼 등 <strong className="text-slate-400">PowerballBet</strong> 원장입니다. 게임머니 통합 줄단위
            로그는{" "}
            <Link href="/betting?game_type=POWERBALL" className="text-premium hover:underline">
              전체 배팅 내역 → 파워볼 필터
            </Link>
            를 이용하세요.
          </p>
          <p className="mt-1 text-[11px] text-slate-700">
            회차 수집·배당·시험 배팅은{" "}
            <Link href="/betting/powerball" className="text-slate-500 hover:text-premium hover:underline">
              게임 관리 → 파워볼 API · 수집
            </Link>
          </p>
        </div>
      </div>

      <div className="glass-card-sm flex flex-col flex-wrap gap-3 p-4 sm:flex-row sm:items-end">
        <KstDateRangeFields
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={(v) => {
            setDateFrom(v);
            setOffset(0);
          }}
          onDateToChange={(v) => {
            setDateTo(v);
            setOffset(0);
          }}
        />
        <label className="flex min-w-[140px] flex-1 flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-widest text-slate-600">아이디 (부분)</span>
          <input
            value={loginFilter}
            onChange={(e) => {
              setLoginFilter(e.target.value);
              setOffset(0);
            }}
            className="admin-touch-input rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-premium/40"
            placeholder="login_id"
          />
        </label>
        <label className="flex w-32 flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-widest text-slate-600">회원 ID</span>
          <input
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value.replace(/\D/g, ""));
              setOffset(0);
            }}
            inputMode="numeric"
            className="admin-touch-input rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-premium/40"
            placeholder="숫자"
          />
        </label>
        <label className="flex min-w-[160px] flex-1 flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-widest text-slate-600">종목 game_key</span>
          <input
            value={gameKey}
            onChange={(e) => {
              setGameKey(e.target.value);
              setOffset(0);
            }}
            className="admin-touch-input rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-premium/40"
            placeholder="coinpowerball3"
          />
        </label>
        <button
          type="button"
          onClick={() => q.refetch()}
          className="admin-touch-btn rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-950"
          style={{ background: "linear-gradient(135deg, #d4af37, #f0e2a8, #8a7530)" }}
        >
          새로고침
        </button>
      </div>

      {q.isError ? (
        <p className="text-sm text-red-400">{(q.error as Error).message}</p>
      ) : null}
      {q.isPending ? <p className="text-sm text-slate-500">불러오는 중…</p> : null}

      {!q.isPending && items.length === 0 ? (
        <div className="glass-card-sm rounded-2xl py-14 text-center">
          <p className="text-2xl">⚡</p>
          <p className="mt-2 text-sm text-slate-500">표시할 파워볼 배팅이 없습니다.</p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div
          className="overflow-x-auto rounded-2xl"
          style={{
            border: "1px solid rgba(212,175,55,0.12)",
            background: "rgba(8,15,28,0.85)",
          }}
        >
          <table className="w-full min-w-[960px] border-collapse text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-800/80 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-3 font-medium">접수</th>
                <th className="px-3 py-3 font-medium">정산</th>
                <th className="px-3 py-3 font-medium">아이디</th>
                <th className="px-3 py-3 font-medium">종목</th>
                <th className="px-3 py-3 font-medium">회차</th>
                <th className="px-3 py-3 font-medium">픽</th>
                <th className="px-3 py-3 text-right font-medium">금액</th>
                <th className="px-3 py-3 text-right font-medium">배당</th>
                <th className="px-3 py-3 font-medium">상태</th>
                <th className="px-3 py-3 text-right font-medium">지급</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-slate-800/40 hover:bg-slate-800/25">
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-400 tabular-nums">{fmtDt(row.created_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-500 tabular-nums">{fmtDt(row.settled_at)}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-200">{row.login_id || `#${row.user_id}`}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400">{row.game_key}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-300">{row.round_no}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-premium/90">{row.pick}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-100">{row.amount}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{row.odds}</td>
                  <td className="px-3 py-2.5 text-slate-400">{row.status}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{row.payout ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={offset === 0 || q.isFetching}
            onClick={() => setOffset((o) => Math.max(0, o - limit))}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 disabled:opacity-40 hover:border-premium/40"
          >
            이전 페이지
          </button>
          <button
            type="button"
            disabled={!canLoadMore || q.isFetching}
            onClick={() => setOffset((o) => o + limit)}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 disabled:opacity-40 hover:border-premium/40"
          >
            다음 페이지
          </button>
          <span className="text-xs text-slate-600">
            offset {applied.offset} · 최대 {limit}건/페이지
          </span>
        </div>
      )}
    </div>
  );
}
