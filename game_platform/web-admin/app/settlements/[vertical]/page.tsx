"use client";

import { useEffect, useMemo, useState } from "react";
import { notFound, useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { formatIsoAsKst, kstTodayYmd } from "@/lib/formatKst";
import { defaultDetailScopeFromRow, type RollingDetailScope } from "@/lib/rollingDetailScope";
import { formatMoneyInt } from "@/lib/formatMoney";
import { rollingRecvTotalString } from "@/lib/rollingRecvTotal";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

const VALID_VERTICALS = ["casino", "slot", "powerball", "sports"] as const;
type SettlementVertical = (typeof VALID_VERTICALS)[number];

const TITLES: Record<SettlementVertical, string> = {
  casino: "카지노 정산",
  slot: "슬롯 정산",
  powerball: "파워볼(미니게임) 정산",
  sports: "스포츠 정산",
};

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
    losing_point_ledger: string;
    losing: string;
    losing_rate_percent: string;
    bet_settlement: string;
    has_children: boolean;
    row_scope?: string;
  }>;
  totals: Record<string, string>;
};

type RollingRecipientRow = {
  user_id: number;
  login_id: string;
  rolling_recv_total?: string;
  rolling_paid_sum: string;
  rolling_self_sum?: string;
  rolling_diff_losing_sum?: string;
  rolling_referral_sum?: string;
  ledger_count: number;
};

type RollingApiResponse = {
  day_start_utc: string;
  day_start_kst?: string;
  period_end_utc?: string;
  date_from?: string;
  date_to?: string;
  vertical?: string;
  timezone?: string;
  recipient_totals: RollingRecipientRow[];
  lines: unknown[];
  totals: {
    total_bet_sum: string;
    valid_bet_sum: string;
    rolling_recv_total?: string;
    rolling_paid_sum: string;
    rolling_self_sum?: string;
    rolling_diff_losing_sum?: string;
    rolling_referral_sum?: string;
  };
};

type RollingDetailItem = {
  ledger_id: number;
  created_at: string | null;
  delta: string;
  reason: string;
  bet_id: number;
  game_type: string;
  bet_amount: string;
  external_bet_uid: string;
  bettor_login: string;
  recipient_login: string;
};

type RollingDetailResponse = {
  recipient_user_id: number;
  recipient_login_id: string | null;
  date_from: string;
  date_to: string;
  vertical: string;
  detail_scope?: string;
  items: RollingDetailItem[];
};

type DetailScope = RollingDetailScope;

function isVertical(v: string): v is SettlementVertical {
  return (VALID_VERTICALS as readonly string[]).includes(v);
}

export default function SettlementVerticalPage() {
  const params = useParams();
  const raw = typeof params?.vertical === "string" ? params.vertical : "";
  if (!isVertical(raw)) {
    notFound();
  }
  return <SettlementVerticalBody vertical={raw} />;
}

function SettlementVerticalBody({ vertical }: { vertical: SettlementVertical }) {
  const title = TITLES[vertical];
  const token = useAuthStore((s) => s.token);
  const me = useAuthStore((s) => s.user);
  const today = useMemo(() => kstTodayYmd(), []);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [parentId, setParentId] = useState<string>(me?.id != null ? String(me.id) : "1");
  const [showRolling, setShowRolling] = useState(true);
  const [detailRecipient, setDetailRecipient] = useState<{
    user_id: number;
    login_id: string;
    initialScope: DetailScope;
  } | null>(null);
  const [detailScope, setDetailScope] = useState<DetailScope>("chain");

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
        vertical,
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
    queryKey: ["admin", "settlements", "rolling-lines", token ?? "", dateFrom, dateTo, vertical],
    queryFn: async () => {
      const base = publicApiBase();
      if (!base || !token) throw new Error("missing env or token");
      const q = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        vertical,
      });
      const r = await fetch(`${base}/admin/settlements/rolling-lines?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`rolling-lines ${r.status}`);
      return (await r.json()) as RollingApiResponse;
    },
    enabled: Boolean(token) && showRolling,
    refetchInterval: 60_000,
  });

  const detailQ = useQuery({
    queryKey: [
      "admin",
      "settlements",
      "rolling-lines",
      "detail",
      token ?? "",
      detailRecipient?.user_id,
      dateFrom,
      dateTo,
      vertical,
      detailScope,
    ],
    queryFn: async () => {
      const base = publicApiBase();
      if (!base || !token || !detailRecipient) throw new Error("missing");
      const q = new URLSearchParams({
        recipient_user_id: String(detailRecipient.user_id),
        date_from: dateFrom,
        date_to: dateTo,
        vertical,
        detail_scope: detailScope,
      });
      const r = await fetch(`${base}/admin/settlements/rolling-lines/detail?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`rolling detail ${r.status}`);
      return (await r.json()) as RollingDetailResponse;
    },
    enabled: Boolean(token) && detailRecipient != null,
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">
          직속 하부(추천 1단)별 기간 합산입니다. 이 페이지는{" "}
          <strong className="text-slate-400">{title.replace(" 정산", "")}</strong> 종목만 집계합니다. (
          <strong className="text-slate-400">날짜: 한국 시간 KST</strong>)
        </p>
        <ul className="mt-2 list-inside list-disc text-xs text-slate-500">
          <li>기간 기본값은 <strong className="text-slate-400">오늘(KST)</strong>입니다.</li>
          <li>하부 행의 아이디를 누르면 그 회원을 상위로 두고 직속 하부만 다시 불러옵니다.</li>
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
          <button
            type="button"
            className="rounded-lg border border-premium/40 bg-premium/10 px-3 py-2 text-sm font-medium text-premium hover:bg-premium/20"
            onClick={() => totalQ.refetch()}
          >
            다시 불러오기
          </button>
        </div>
      </div>

      {totalQ.isLoading && <p className="text-sm text-slate-500">표를 불러오는 중…</p>}
      {totalQ.isError && (
        <p className="text-sm text-red-400">
          {(totalQ.error as Error)?.message ?? "표를 불러오지 못했습니다."}
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
          <p className="text-[11px] leading-relaxed text-slate-500">
            <strong className="text-slate-400">롤링합</strong>은 행마다 그 회원 <strong className="text-slate-300">하부
            트리 전체</strong>가 받은 추천·본인·차액 롤링만(차액 루징 제외). 아래「받은 합계」는{" "}
            <strong className="text-slate-300">수령인 1명</strong> 기준이라 숫자가 다를 수 있습니다.
          </p>
          <div className="table-scroll rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full min-w-[1080px] text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="p-2">구분 / 하부</th>
                  <th className="p-2 text-right">입금</th>
                  <th className="p-2 text-right">출금</th>
                  <th className="p-2 text-right">충환 순</th>
                  <th className="p-2 text-right">배팅액</th>
                  <th className="p-2 text-right">당첨</th>
                  <th className="p-2 text-right">배팅손익</th>
                  <th className="p-2 text-right">롤링합</th>
                  <th className="p-2 text-right">배팅정산</th>
                  <th className="p-2 text-right">루징(추정)</th>
                  <th className="p-2 text-right">보유머니</th>
                  <th className="p-2 text-right">보유롤링P</th>
                </tr>
              </thead>
              <tbody>
                {totalQ.data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="p-6 text-center text-slate-500">
                      표시할 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  totalQ.data.rows.map((row) => (
                    <tr
                      key={`${row.row_scope ?? "row"}-${row.user_id}`}
                      className={`border-b border-slate-800/70 hover:bg-slate-800/30 ${
                        row.row_scope === "full_subtree" ? "bg-slate-900/60" : ""
                      }`}
                    >
                      <td className="p-2">
                        <button
                          type="button"
                          title="이 회원을 상위(기준)으로 두고 표 다시 보기"
                          className="group inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-left"
                          onClick={() => setParentId(String(row.user_id))}
                        >
                          {row.row_scope === "full_subtree" ? (
                            <span className="mr-1 rounded border border-premium/30 bg-premium/10 px-1.5 py-0.5 text-[10px] font-semibold text-premium">
                              전체
                            </span>
                          ) : null}
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
                      <td className="p-2 text-right tabular-nums font-medium text-premium">
                        {formatMoneyInt(row.bet_settlement)}
                      </td>
                      <td className="p-2 text-right tabular-nums text-amber-200/90">{formatMoneyInt(row.losing)}</td>
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
                    <td className="p-2 text-right tabular-nums text-premium">
                      {formatMoneyInt(totalQ.data.totals.bet_settlement)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoneyInt(totalQ.data.totals.losing)}
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
          onClick={() => setShowRolling((v) => !v)}
        >
          <div>
            <h3 className="text-base font-semibold text-slate-200">롤링포인트 수령 합계 ({title.replace(" 정산", "")})</h3>
            <p className="mt-1 text-xs text-slate-500">
              <strong className="text-slate-400">받은 합계</strong>가 해당 회원에게 들어간 롤링P 총액입니다.{" "}
              <strong className="text-slate-400">차액 롤(P)</strong>은 상부 차액만(하부는 보통 0). 행을 누르면 원장
              상세가 열립니다.
            </p>
          </div>
          <span className="text-slate-500">{showRolling ? "접기" : "펼치기"}</span>
        </button>

        {showRolling && (
          <div className="mt-4 space-y-4">
            {rollingQ.isLoading && <p className="text-sm text-slate-500">불러오는 중…</p>}
            {rollingQ.isError && (
              <p className="text-sm text-red-400">롤링 표를 불러오지 못했습니다.</p>
            )}
            {rollingQ.data && (
              <>
                <p className="text-sm text-slate-500">
                  집계 기간 (KST):{" "}
                  <span className="font-mono text-premium">
                    {rollingQ.data.date_from} ~ {rollingQ.data.date_to}
                  </span>
                </p>
                <div className="table-scroll rounded-xl border border-slate-800 bg-slate-900/40">
                  <table className="w-full min-w-[720px] text-left text-sm text-slate-300">
                    <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="p-3">수령 회원</th>
                        <th className="p-3 text-right text-premium">받은 합계(P)</th>
                        <th className="p-3 text-right">차액 롤(P)</th>
                        <th className="p-3 text-right">본인(P)</th>
                        <th className="p-3 text-right">차액루징(P)</th>
                        <th className="p-3 text-right">추천(P)</th>
                        <th className="p-3 text-right">원장 건수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rollingQ.data.recipient_totals ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-slate-500">
                            해당 기간·종목의 롤링 지급 내역이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        (rollingQ.data.recipient_totals ?? []).map((row) => (
                          <tr
                            key={row.user_id}
                            role="button"
                            tabIndex={0}
                            className="cursor-pointer border-b border-slate-800/70 hover:bg-slate-800/30"
                            onClick={() => {
                              const s = defaultDetailScopeFromRow(row);
                              setDetailScope(s);
                              setDetailRecipient({
                                user_id: row.user_id,
                                login_id: row.login_id,
                                initialScope: s,
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                const s = defaultDetailScopeFromRow(row);
                                setDetailScope(s);
                                setDetailRecipient({
                                  user_id: row.user_id,
                                  login_id: row.login_id,
                                  initialScope: s,
                                });
                              }
                            }}
                          >
                            <td className="p-3 font-mono text-premium">{row.login_id}</td>
                            <td className="p-3 text-right tabular-nums font-semibold text-premium">
                              {formatMoneyInt(rollingRecvTotalString(row))}
                            </td>
                            <td className="p-3 text-right tabular-nums text-emerald-300/90">
                              {formatMoneyInt(row.rolling_paid_sum)}
                            </td>
                            <td className="p-3 text-right tabular-nums text-slate-400">
                              {formatMoneyInt(row.rolling_self_sum ?? "0")}
                            </td>
                            <td className="p-3 text-right tabular-nums text-slate-400">
                              {formatMoneyInt(row.rolling_diff_losing_sum ?? "0")}
                            </td>
                            <td className="p-3 text-right tabular-nums text-slate-400">
                              {formatMoneyInt(row.rolling_referral_sum ?? "0")}
                            </td>
                            <td className="p-3 text-right tabular-nums text-slate-500">
                              {row.ledger_count}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {(rollingQ.data.recipient_totals ?? []).length > 0 && (
                      <tfoot className="border-t border-premium/20 bg-slate-950/80 text-sm font-semibold">
                        <tr>
                          <td className="p-3 text-slate-400">합계</td>
                          <td className="p-3 text-right tabular-nums font-semibold text-premium">
                            {formatMoneyInt(rollingRecvTotalString(rollingQ.data.totals))}
                          </td>
                          <td className="p-3 text-right tabular-nums text-emerald-300">
                            {formatMoneyInt(rollingQ.data.totals.rolling_paid_sum)}
                          </td>
                          <td className="p-3 text-right tabular-nums text-slate-400">
                            {formatMoneyInt(rollingQ.data.totals.rolling_self_sum ?? "0")}
                          </td>
                          <td className="p-3 text-right tabular-nums text-slate-400">
                            {formatMoneyInt(rollingQ.data.totals.rolling_diff_losing_sum ?? "0")}
                          </td>
                          <td className="p-3 text-right tabular-nums text-slate-400">
                            {formatMoneyInt(rollingQ.data.totals.rolling_referral_sum ?? "0")}
                          </td>
                          <td className="p-3" />
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

      {detailRecipient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rolling-detail-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetailRecipient(null);
          }}
        >
          <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
              <h4 id="rolling-detail-title" className="text-sm font-semibold text-slate-100">
                롤링 원장 상세 — {detailRecipient.login_id} (#{detailRecipient.user_id})
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  구분
                  <select
                    value={detailScope}
                    onChange={(e) => setDetailScope(e.target.value as DetailScope)}
                    className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                  >
                    <option value="chain">차액 롤링만</option>
                    <option value="self">본인 롤링만</option>
                    <option value="losing">차액 루징만</option>
                    <option value="referral">추천 롤링만</option>
                    <option value="all">전체</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  onClick={() => setDetailRecipient(null)}
                >
                  닫기
                </button>
              </div>
            </div>
            <p className="border-b border-slate-800 px-4 pb-2 text-[11px] leading-relaxed text-slate-500">
              <strong className="text-slate-400">차액 롤링</strong>이 0이면 본인·추천·루징 건은{" "}
              <strong className="text-slate-400">구분</strong>에서 바꿔야 보입니다. 행을 누르면 위 표 숫자에 맞게
              기본값이 잡힙니다.
            </p>
            <div className="max-h-[calc(85vh-3.5rem)] overflow-auto p-4">
              {detailQ.isLoading && <p className="text-sm text-slate-500">불러오는 중…</p>}
              {detailQ.isError && (
                <p className="text-sm text-red-400">상세를 불러오지 못했습니다.</p>
              )}
              {detailQ.data && (
                <div className="table-scroll rounded-lg border border-slate-800">
                  <table className="w-full min-w-[720px] text-left text-xs text-slate-300">
                    <thead className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                      <tr>
                        <th className="p-2">시각 (KST)</th>
                        <th className="p-2 text-right">지급(P)</th>
                        <th className="p-2">사유</th>
                        <th className="p-2">배터</th>
                        <th className="p-2">종목</th>
                        <th className="p-2 text-right">배팅액</th>
                        <th className="p-2 font-mono">배팅 ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailQ.data.items.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-slate-500">
                            해당 구간에 건별 내역이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        detailQ.data.items.map((it) => (
                          <tr key={it.ledger_id} className="border-b border-slate-800/60">
                            <td className="p-2 whitespace-nowrap text-slate-400">
                              {formatIsoAsKst(it.created_at)}
                            </td>
                            <td className="p-2 text-right tabular-nums text-emerald-300/90">
                              {formatMoneyInt(it.delta)}
                            </td>
                            <td className="p-2">{it.reason}</td>
                            <td className="p-2 font-mono">{it.bettor_login}</td>
                            <td className="p-2">{it.game_type}</td>
                            <td className="p-2 text-right tabular-nums">{formatMoneyInt(it.bet_amount)}</td>
                            <td className="p-2 font-mono text-[10px] text-slate-500">
                              #{it.bet_id} · {it.external_bet_uid}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
