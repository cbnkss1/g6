"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playCashRequestBeep } from "@/lib/playCashBeep";
import { formatMoneyInt } from "@/lib/formatMoney";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";
import { useAdminDashboardSocket } from "@/hooks/useAdminDashboardSocket";

type CashReq = {
  id: number;
  user_id: number;
  login_id: string;
  request_type: string;
  status: string;
  amount: string;
  memo: string | null;
  required_rolling_amount: string;
  reject_reason: string | null;
  created_at: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-500/20 text-amber-300 border border-amber-500/40",
  PROCESSING: "bg-sky-500/20 text-sky-200 border border-sky-500/40",
  APPROVED: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
  REJECTED: "bg-red-500/20 text-red-300 border border-red-500/40",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "신규",
  PROCESSING: "처리중",
  APPROVED: "승인",
  REJECTED: "거절",
};

function isQueueStatus(s: string): boolean {
  return s === "PENDING" || s === "PROCESSING";
}

const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "입금",
  WITHDRAW: "출금",
};

function fmtMoney(v: string | number | null | undefined): string {
  if (v == null) return "-";
  return formatMoneyInt(v);
}

function fmtDt(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}

export default function CashPage() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const sp = useSearchParams();
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [typeFilter, setTypeFilter] = useState("");
  const [rejectReason, setRejectReason] = useState<Record<number, string>>({});
  const [flashIds, setFlashIds] = useState<Set<number>>(new Set());
  const prevIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    const rt = sp.get("request_type");
    const st = sp.get("status");
    if (rt === "DEPOSIT" || rt === "WITHDRAW") setTypeFilter(rt);
    if (st === "PENDING" || st === "PROCESSING" || st === "APPROVED" || st === "REJECTED") {
      setStatusFilter(st);
    }
  }, [sp]);

  const base = publicApiBase();
  const [alertBanner, setAlertBanner] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const authHeaders = useCallback(() => {
    const t = useAuthStore.getState().token;
    if (!t) return null;
    return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } as const;
  }, []);

  // WS 실시간 — 새 신청 알림 수신 시 목록 갱신 + 표시·소리
  useAdminDashboardSocket({
    onExtraMessage: (msg) => {
      if (
        msg.type === "cash_request_new" ||
        msg.type === "cash_request_approved" ||
        msg.type === "cash_request_updated"
      ) {
        qc.invalidateQueries({ queryKey: ["cash-requests"] });
      }
      if (msg.type === "cash_request_new") {
        const p = msg.payload ?? {};
        const amt = p.amount != null ? String(p.amount) : "";
        setAlertBanner(`새 입출금 신청이 접수되었습니다.${amt ? ` (금액 ${amt})` : ""}`);
        playCashRequestBeep();
        window.setTimeout(() => setAlertBanner(null), 12_000);
      }
    },
  });

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  if (typeFilter) params.set("request_type", typeFilter);
  params.set("limit", "100");

  const { data, isLoading } = useQuery({
    queryKey: ["cash-requests", statusFilter, typeFilter, token],
    queryFn: async () => {
      const headers = authHeaders();
      if (!headers) throw new Error("로그인이 필요합니다.");
      const r = await fetch(`${base}/admin/cash/requests?${params}`, { headers });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as { items: CashReq[] };
    },
    refetchInterval: 15000,
    enabled: !!token,
  });

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  // 새로 들어온 대기열(PENDING/PROCESSING) 깜빡임
  useEffect(() => {
    const cur = new Set(items.filter((i) => isQueueStatus(i.status)).map((i) => i.id));
    const newIds = Array.from(cur).filter((id) => !prevIds.current.has(id));
    if (newIds.length > 0) {
      setFlashIds(new Set(newIds));
      window.setTimeout(() => setFlashIds(new Set()), 2500);
    }
    prevIds.current = cur;
  }, [items]);

  const approve = useMutation({
    mutationFn: async (id: number) => {
      const h = authHeaders();
      if (!h) throw new Error("로그인이 필요합니다.");
      const r = await fetch(`${base}/admin/cash/requests/${id}/approve`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ reason: "" }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onMutate: () => setActionError(null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cash-requests"] }),
    onError: (e: Error) => setActionError(e.message || "승인 실패"),
  });

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const h = authHeaders();
      if (!h) throw new Error("로그인이 필요합니다.");
      const r = await fetch(`${base}/admin/cash/requests/${id}/reject`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ reason }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onMutate: () => setActionError(null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cash-requests"] }),
    onError: (e: Error) => setActionError(e.message || "거절 실패"),
  });

  const markProcessing = useMutation({
    mutationFn: async (id: number) => {
      const h = authHeaders();
      if (!h) throw new Error("로그인이 필요합니다.");
      const r = await fetch(`${base}/admin/cash/requests/${id}/processing`, {
        method: "POST",
        headers: h,
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onMutate: () => setActionError(null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cash-requests"] }),
    onError: (e: Error) => setActionError(e.message || "처리중 표시 실패"),
  });

  const pendingCount = items.filter((i) => isQueueStatus(i.status)).length;
  const depositSum = items
    .filter((i) => i.request_type === "DEPOSIT" && isQueueStatus(i.status))
    .reduce((s, i) => s + Number(i.amount), 0);
  const withdrawSum = items
    .filter((i) => i.request_type === "WITHDRAW" && isQueueStatus(i.status))
    .reduce((s, i) => s + Number(i.amount), 0);

  const processingOnlyCount = items.filter((i) => i.status === "PROCESSING").length;

  return (
    <div className="space-y-5 animate-fade-up">
      {/* 헤더 */}
      <div>
        <p className="text-premium-label">입출금 센터</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-100"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          실시간 입출금 관리
        </h1>
        <p className="mt-2 text-[11px] text-slate-600">
          새 신청 시 상단 배너·알림음이 재생됩니다. 브라우저 정책상 <strong className="text-slate-500">이 페이지를 한 번 클릭</strong>한 뒤부터 소리가 날 수 있습니다.
        </p>
      </div>

      {alertBanner && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-premium/40 bg-premium/15 px-4 py-3 text-sm text-premium shadow-[0_0_20px_rgba(212,175,55,0.15)]"
        >
          <span className="font-medium">{alertBanner}</span>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-premium/40 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/5"
            onClick={() => setAlertBanner(null)}
          >
            닫기
          </button>
        </div>
      )}
      {actionError && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {actionError}
        </div>
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "대기 신청", value: pendingCount, unit: "건", color: "#d4af37", icon: "⏳" },
          { label: "입금 대기", value: fmtMoney(depositSum), unit: "원", color: "#34d399", icon: "↓" },
          { label: "출금 대기", value: fmtMoney(withdrawSum), unit: "원", color: "#f87171", icon: "↑" },
        ].map(c => (
          <div key={c.label} className="glass-card-sm flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-medium uppercase tracking-widest text-slate-600">{c.label}</p>
              <span style={{ color: c.color }}>{c.icon}</span>
            </div>
            <p className="text-xl font-bold tabular-nums" style={{ color: c.color }}>
              {typeof c.value === "number" ? c.value : c.value}
              <span className="ml-1 text-[10px] font-normal text-slate-600">{c.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {/* 필터 탭 */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["", "전체"],
            ["PENDING", "대기 (접수)"],
            ["PROCESSING", "처리중만"],
            ["APPROVED", "승인"],
            ["REJECTED", "거절"],
          ] as const
        ).map(([s, l]) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`admin-touch-btn rounded-full border px-4 text-xs font-semibold transition-all ${
              statusFilter === s
                ? "border-premium bg-premium/12 text-premium shadow-[0_0_12px_rgba(212,175,55,0.2)]"
                : "border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300"
            }`}
          >
            {l}{" "}
            {s === "PENDING" && pendingCount > 0 && (
              <span className="ml-1 rounded-full bg-premium px-1.5 py-0.5 text-[9px] font-bold text-slate-950">
                {pendingCount}
              </span>
            )}
            {s === "PROCESSING" && processingOnlyCount > 0 && (
              <span className="ml-1 rounded-full bg-sky-600/80 px-1.5 py-0.5 text-[9px] font-bold text-white">
                {processingOnlyCount}
              </span>
            )}
          </button>
        ))}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="admin-touch-btn rounded-full border border-slate-800 bg-transparent px-3 text-xs text-slate-400 outline-none"
        >
          <option value="">전체 유형</option>
          <option value="DEPOSIT">입금</option>
          <option value="WITHDRAW">출금</option>
        </select>
      </div>

      {isLoading && (
        <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="shimmer h-24 rounded-2xl"/>)}</div>
      )}
      {!isLoading && items.length === 0 && (
        <div className="glass-card py-16 text-center">
          <p className="text-3xl mb-3">$</p>
          <p className="text-slate-600 text-sm">항목 없음</p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((req) => {
          const isFlash = flashIds.has(req.id);
          const isDeposit = req.request_type === "DEPOSIT";
          return (
            <div
              key={req.id}
              className={`glass-card p-4 transition-all duration-500 ${isFlash ? "glow-flash-gold" : ""}`}
              style={{
                borderColor: isFlash
                  ? "rgba(212,175,55,0.5)"
                  : isQueueStatus(req.status)
                    ? "rgba(212,175,55,0.15)"
                    : "rgba(51,65,85,0.4)",
              }}
            >
              <div className="flex flex-wrap items-start gap-3">
                {/* 좌측 아이콘 */}
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl ${
                  isDeposit ? "bg-emerald-500/12" : "bg-red-500/12"
                }`}
                  style={{ border: `1px solid ${isDeposit ? "rgba(52,211,153,0.2)" : "rgba(239,68,68,0.2)"}` }}>
                  {isDeposit ? "↓" : "↑"}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-100">{req.login_id}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      isDeposit ? "bg-emerald-500/12 border-emerald-500/25 text-emerald-300" : "bg-red-500/12 border-red-500/25 text-red-400"
                    }`}>
                      {TYPE_LABEL[req.request_type] ?? req.request_type}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[req.status] ?? ""}`}>
                      {STATUS_LABEL[req.status] ?? req.status}
                    </span>
                    {isFlash && (
                      <span className="animate-pulse rounded-full bg-premium px-2 py-0.5 text-[9px] font-bold text-slate-950">
                        NEW ●
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold tabular-nums"
                    style={{ color: isDeposit ? "#34d399" : "#f87171" }}>
                    {fmtMoney(req.amount)}
                    <span className="ml-1 text-sm font-normal text-slate-500">원</span>
                  </p>
                  {req.memo && <p className="text-xs text-slate-500">메모: {req.memo}</p>}
                  {req.reject_reason && <p className="text-xs text-red-400">사유: {req.reject_reason}</p>}
                  <p className="text-[10px] text-slate-700">{fmtDt(req.created_at)}</p>
                </div>

                {/* 처리 대기(검토) / 승인 / 거절 */}
                {isQueueStatus(req.status) && (
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[200px]">
                    {req.status === "PENDING" && (
                      <button
                        type="button"
                        onClick={() => markProcessing.mutate(req.id)}
                        disabled={markProcessing.isPending}
                        className="admin-touch-btn rounded-xl border border-sky-500/35 bg-sky-950/50 text-sm font-semibold text-sky-200 transition-all hover:bg-sky-900/50 disabled:opacity-40"
                      >
                        {markProcessing.isPending ? "…" : "⏸ 처리 대기 (검토중)"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => approve.mutate(req.id)}
                      disabled={approve.isPending || markProcessing.isPending}
                      className="admin-touch-btn rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
                      style={{ background: "linear-gradient(135deg,#059669,#047857)" }}
                    >
                      {approve.isPending ? "처리 중…" : "✓ 승인"}
                    </button>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="거절 사유"
                        value={rejectReason[req.id] ?? ""}
                        onChange={(e) => setRejectReason((p) => ({ ...p, [req.id]: e.target.value }))}
                        className="admin-touch-input min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950/70 px-3 text-xs text-slate-200 placeholder-slate-700 outline-none focus:border-red-500/30"
                      />
                      <button
                        type="button"
                        onClick={() => reject.mutate({ id: req.id, reason: rejectReason[req.id] ?? "" })}
                        disabled={reject.isPending || markProcessing.isPending}
                        className="admin-touch-btn w-12 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
                        style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)" }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
