"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatIsoAsKst, kstDaysAgoYmd, kstTodayYmd } from "@/lib/formatKst";
import { formatMoneyInt } from "@/lib/formatMoney";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

/** GET /admin/settlements/total-revenue-table */
type TotalRevenueResponse = {
  parent: { id: number; login_id: string; display_name: string };
  parent_referrer_id: number | null;
  date_from: string;
  date_to: string;
  timezone: string;
  vertical: string;
  rows: Array<{
    user_id: number;
    login_id: string;
    display_name: string;
    deposit_sum: string;
    withdraw_sum: string;
    cash_net: string;
    game_money_balance: string;
    rolling_point_balance: string;
    bet_amount: string;
    win_amount: string;
    bet_profit_loss: string;
    rolling_total: string;
    rolling_from_members: string;
    rolling_self: string;
    rolling_points: string;
    losing: string;
    losing_rate_percent: string;
    bet_settlement: string;
    has_children: boolean;
  }>;
  totals: Record<string, string>;
};

/** GET /admin/settlements/rolling-lines */
type RollingLine = {
  ledger_id: number;
  credited_at: string;
  referrer_login_id: string;
  player_login_id: string;
  game_type: string;
  bet_id: number;
  total_bet: string;
  valid_bet: string;
  configured_rate_percent: string;
  rolling_paid: string;
  implied_rate_percent: string;
  game_result: string;
};

type RollingApiResponse = {
  day_start_utc: string;
  day_start_kst?: string;
  timezone?: string;
  lines: RollingLine[];
  totals: {
    total_bet_sum: string;
    valid_bet_sum: string;
    rolling_paid_sum: string;
  };
};

function defaultKstRange(): { from: string; to: string } {
  return { from: kstDaysAgoYmd(30), to: kstTodayYmd() };
}

export default function SettlementsPage() {
  const token = useAuthStore((s) => s.token);
  const me = useAuthStore((s) => s.user);
  const def = useMemo(() => defaultKstRange(), []);
  const [dateFrom, setDateFrom] = useState(def.from);
  const [dateTo, setDateTo] = useState(def.to);
  const [parentId, setParentId] = useState<string>(me?.id != null ? String(me.id) : "1");
  const [vertical, setVertical] = useState<"all" | "casino" | "slot" | "powerball" | "sports">(
    "all",
  );
  const [showRollingVerify, setShowRollingVerify] = useState(true);

  useEffect(() => {
    if (me?.id != null) setParentId(String(me.id));
  }, [me?.id]);

  const totalQ = useQuery({
    queryKey: [
      "admin",
      "settlements",
      "total-revenue-table",
      token ?? "",
      dateFrom,
      dateTo,
      parentId,
      vertical,
    ],
    queryFn: async () => {
      const base = publicApiBase();
      if (!base || !token) throw new Error("missing env or token");
      const pid = Number.parseInt(parentId.trim(), 10);
      if (!Number.isFinite(pid)) throw new Error("상위 회원 ID가 올바르지 않습니다.");
      const q = new URLSearchParams({
        parent_id: String(pid),
        date_from: dateFrom,
        date_to: dateTo,
        vertical: vertical === "all" ? "all" : vertical,
      });
      const r = await fetch(`${base}/admin/settlements/total-revenue-table?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        const detail =
          err && typeof err === "object" && "detail" in err ? String((err as { detail: unknown }).detail) : r.statusText;
        throw new Error(detail || `total-revenue ${r.status}`);
      }
      return (await r.json()) as TotalRevenueResponse;
    },
    enabled: Boolean(token) && Boolean(dateFrom) && Boolean(dateTo) && parentId.trim().length > 0,
  });

  const rollingQ = useQuery({
    queryKey: ["admin", "settlements", "rolling-lines", token ?? ""],
    queryFn: async () => {
      const base = publicApiBase();
      if (!base || !token) throw new Error("missing env or token");
      const r = await fetch(`${base}/admin/settlements/rolling-lines`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`rolling-lines ${r.status}`);
      return (await r.json()) as RollingApiResponse;
    },
    enabled: Boolean(token) && showRollingVerify,
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">전체 수익 · 정산판</h2>
        <p className="mt-1 text-sm text-slate-500">
          직속 하부(추천 1단)별로 기간 합산입니다. 입출금·배팅·롤링·루징을 한 화면에서 봅니다. (
          <strong className="text-slate-400">집계·날짜: 한국 시간 KST</strong>)
        </p>
        <ul className="mt-2 list-inside list-disc text-xs text-slate-500">
          <li>
            <strong className="font-medium text-slate-400">배팅액</strong>은 정산 완료된 건만 집계됩니다. 회차·경기
            미정산이면 0으로 보일 수 있습니다.
          </li>
          <li>
            기간 입력은 <strong className="font-medium text-slate-400">한국 달력(자정~자정, KST)</strong> 기준입니다.
          </li>
          <li>
            하부 행의 <strong className="font-medium text-slate-400">아이디</strong>를 누르면 그 회원을 상위로 두고
            직속 하부만 다시 불러옵니다 (하위 탐색).
          </li>
        </ul>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            기간 시작 (한국 날짜)
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            기간 종료 (한국 날짜)
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            상위 회원 ID (행 = 이 회원의 직속 하부)
            <input
              type="text"
              inputMode="numeric"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-36 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-sm text-slate-200"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            구간
            <select
              value={vertical}
              onChange={(e) =>
                setVertical(e.target.value as "all" | "casino" | "slot" | "powerball" | "sports")
              }
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
            >
              <option value="all">전체 종목</option>
              <option value="casino">카지노계열</option>
              <option value="slot">슬롯</option>
              <option value="powerball">파워볼</option>
              <option value="sports">스포츠·토토</option>
            </select>
          </label>
          <button
            type="button"
            className="rounded-lg border border-premium/40 bg-premium/10 px-3 py-2 text-sm font-medium text-premium hover:bg-premium/20"
            onClick={() => totalQ.refetch()}
          >
            다시 불러오기
          </button>
        </div>
      </div>

      {totalQ.isLoading && <p className="text-sm text-slate-500">전체 수익 표를 불러오는 중…</p>}
      {totalQ.isError && (
        <p className="text-sm text-red-400">
          {(totalQ.error as Error)?.message ?? "전체 수익 표를 불러오지 못했습니다."}
        </p>
      )}

      {totalQ.data && (
        <div className="space-y-2">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-500">
            <span>
              기준 상위:{" "}
              <span className="font-mono text-premium">
                {totalQ.data.parent.login_id} (#{totalQ.data.parent.id})
              </span>{" "}
              · 기간 {totalQ.data.date_from} ~ {totalQ.data.date_to} (KST) · 구간: {totalQ.data.vertical}
            </span>
            {totalQ.data.parent_referrer_id != null ? (
              <button
                type="button"
                className="rounded-md border border-slate-600 px-2 py-1 font-mono text-[11px] text-slate-300 hover:border-premium/40 hover:text-premium"
                title="이 회원의 추천 상위를 기준으로 직속 하부 표 보기"
                onClick={() => setParentId(String(totalQ.data.parent_referrer_id))}
              >
                ↑ 상위 한 단계 (#{totalQ.data.parent_referrer_id})
              </button>
            ) : null}
          </p>
          <div className="table-scroll rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full min-w-[1200px] text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="p-2">하부</th>
                  <th className="p-2 text-right">입금</th>
                  <th className="p-2 text-right">출금</th>
                  <th className="p-2 text-right">충환 순</th>
                  <th className="p-2 text-right">배팅액</th>
                  <th className="p-2 text-right">당첨</th>
                  <th className="p-2 text-right">배팅손익</th>
                  <th className="p-2 text-right">롤링합</th>
                  <th className="p-2 text-right">하부→롤링</th>
                  <th className="p-2 text-right">본인롤링</th>
                  <th className="p-2 text-right">루징(추정)</th>
                  <th className="p-2 text-right">배팅정산</th>
                  <th className="p-2 text-right">보유머니</th>
                  <th className="p-2 text-right">보유롤링P</th>
                </tr>
              </thead>
              <tbody>
                {totalQ.data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="p-6 text-center text-slate-500">
                      이 기간·상위 기준 직속 하부가 없거나 집계가 없습니다.
                    </td>
                  </tr>
                ) : (
                  totalQ.data.rows.map((row) => (
                    <tr key={row.user_id} className="border-b border-slate-800/70 hover:bg-slate-800/30">
                      <td className="p-2">
                        <button
                          type="button"
                          title="이 회원을 상위(기준)로 두고 직속 하부 목록 보기"
                          className="group inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-left"
                          onClick={() => setParentId(String(row.user_id))}
                        >
                          <span className="font-medium text-slate-200 underline decoration-slate-600 underline-offset-2 group-hover:text-premium group-hover:decoration-premium/60">
                            {row.login_id}
                          </span>
                          {row.has_children ? (
                            <span className="rounded border border-slate-600/80 bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-slate-400 group-hover:border-premium/40 group-hover:text-premium/90">
                              하위 있음
                            </span>
                          ) : null}
                        </button>
                      </td>
                      <td className="p-2 text-right tabular-nums">{formatMoneyInt(row.deposit_sum)}</td>
                      <td className="p-2 text-right tabular-nums">{formatMoneyInt(row.withdraw_sum)}</td>
                      <td className="p-2 text-right tabular-nums">{formatMoneyInt(row.cash_net)}</td>
                      <td className="p-2 text-right tabular-nums">{formatMoneyInt(row.bet_amount)}</td>
                      <td className="p-2 text-right tabular-nums">{formatMoneyInt(row.win_amount)}</td>
                      <td className="p-2 text-right tabular-nums">{formatMoneyInt(row.bet_profit_loss)}</td>
                      <td className="p-2 text-right tabular-nums">{formatMoneyInt(row.rolling_total)}</td>
                      <td className="p-2 text-right tabular-nums text-emerald-300/90">
                        {formatMoneyInt(row.rolling_from_members)}
                      </td>
                      <td className="p-2 text-right tabular-nums">{formatMoneyInt(row.rolling_self)}</td>
                      <td className="p-2 text-right tabular-nums text-amber-200/90">{formatMoneyInt(row.losing)}</td>
                      <td className="p-2 text-right tabular-nums font-medium text-premium">
                        {formatMoneyInt(row.bet_settlement)}
                      </td>
                      <td className="p-2 text-right tabular-nums text-slate-400">
                        {formatMoneyInt(row.game_money_balance)}
                      </td>
                      <td className="p-2 text-right tabular-nums text-slate-400">
                        {formatMoneyInt(row.rolling_point_balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {totalQ.data.rows.length > 0 && (
                <tfoot className="border-t border-premium/20 bg-slate-950/80 text-[11px] font-semibold">
                  <tr>
                    <td className="p-2 text-slate-400">합계</td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoneyInt(totalQ.data.totals.deposit_sum)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoneyInt(totalQ.data.totals.withdraw_sum)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoneyInt(totalQ.data.totals.cash_net)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoneyInt(totalQ.data.totals.bet_amount)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoneyInt(totalQ.data.totals.win_amount)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoneyInt(totalQ.data.totals.bet_profit_loss)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoneyInt(totalQ.data.totals.rolling_total)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoneyInt(totalQ.data.totals.rolling_from_members)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoneyInt(totalQ.data.totals.rolling_self)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoneyInt(totalQ.data.totals.losing)}
                    </td>
                    <td className="p-2 text-right tabular-nums text-premium">
                      {formatMoneyInt(totalQ.data.totals.bet_settlement)}
                    </td>
                    <td className="p-2 text-right text-slate-600" colSpan={2}>
                      —
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      <div className="border-t border-slate-800 pt-6">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setShowRollingVerify((v) => !v)}
        >
          <div>
            <h3 className="text-base font-semibold text-slate-200">오늘 추천인 롤링 지급 라인 (검증)</h3>
            <p className="mt-1 text-xs text-slate-500">
              유효배팅 × 요율 ≈ 지급 롤링 검증용. <strong className="text-slate-400">당일 KST 자정</strong> 이후
              지급분만 표시됩니다.
            </p>
          </div>
          <span className="text-slate-500">{showRollingVerify ? "접기" : "펼치기"}</span>
        </button>

        {showRollingVerify && (
          <div className="mt-4 space-y-4">
            {rollingQ.isLoading && <p className="text-sm text-slate-500">불러오는 중…</p>}
            {rollingQ.isError && (
              <p className="text-sm text-red-400">롤링 검증 표를 불러오지 못했습니다.</p>
            )}
            {rollingQ.data && (
              <>
                <p className="text-sm text-slate-500">
                  집계 기준 시각 — KST:{" "}
                  <span className="font-mono text-premium">
                    {rollingQ.data.day_start_kst ?? rollingQ.data.day_start_utc}
                  </span>
                  {rollingQ.data.timezone ? (
                    <span className="ml-2 text-slate-600">({rollingQ.data.timezone})</span>
                  ) : null}
                </p>
                <div className="table-scroll rounded-xl border border-slate-800 bg-slate-900/40">
                  <table className="w-full min-w-[920px] text-left text-sm text-slate-300">
                    <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="p-3">지급 시각 (KST)</th>
                        <th className="p-3">롤링 수령</th>
                        <th className="p-3">플레이어</th>
                        <th className="p-3">게임</th>
                        <th className="p-3 text-right">총 배팅</th>
                        <th className="p-3 text-right text-premium">유효 배팅</th>
                        <th className="p-3 text-right">요율 %</th>
                        <th className="p-3 text-right">지급 롤링</th>
                        <th className="p-3 text-right">역산 %</th>
                        <th className="p-3">결과</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rollingQ.data.lines.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-6 text-center text-slate-500">
                            오늘 지급된 롤링 내역이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        rollingQ.data.lines.map((row) => (
                          <tr
                            key={row.ledger_id}
                            className="border-b border-slate-800/70 hover:bg-slate-800/30"
                          >
                            <td className="p-3 font-mono text-xs text-slate-400">
                              {formatIsoAsKst(row.credited_at)}
                            </td>
                            <td className="p-3">{row.referrer_login_id}</td>
                            <td className="p-3">{row.player_login_id}</td>
                            <td className="p-3">{row.game_type}</td>
                            <td className="p-3 text-right tabular-nums">{formatMoneyInt(row.total_bet)}</td>
                            <td className="p-3 text-right tabular-nums font-medium text-premium-glow">
                              {formatMoneyInt(row.valid_bet)}
                            </td>
                            <td className="p-3 text-right tabular-nums">{row.configured_rate_percent}</td>
                            <td className="p-3 text-right tabular-nums text-emerald-300/90">
                              {formatMoneyInt(row.rolling_paid)}
                            </td>
                            <td className="p-3 text-right tabular-nums text-slate-500">
                              {row.implied_rate_percent}
                            </td>
                            <td className="p-3 font-mono text-xs">{row.game_result}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {rollingQ.data.lines.length > 0 && (
                      <tfoot className="border-t border-premium/20 bg-slate-950/80 text-sm font-semibold">
                        <tr>
                          <td colSpan={4} className="p-3 text-slate-400">
                            합계
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {formatMoneyInt(rollingQ.data.totals.total_bet_sum)}
                          </td>
                          <td className="p-3 text-right tabular-nums text-premium">
                            {formatMoneyInt(rollingQ.data.totals.valid_bet_sum)}
                          </td>
                          <td className="p-3" />
                          <td className="p-3 text-right tabular-nums text-emerald-300">
                            {formatMoneyInt(rollingQ.data.totals.rolling_paid_sum)}
                          </td>
                          <td colSpan={2} className="p-3" />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
