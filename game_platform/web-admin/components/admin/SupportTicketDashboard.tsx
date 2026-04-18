"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { adminFetch } from "@/lib/adminFetch";
import { formatMoneyInt } from "@/lib/formatMoney";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

const MACROS = [
  {
    key: "deposit",
    label: "입금 확인 중",
    text:
      "안녕하세요.\n입금 내역 확인 중입니다. 영업시간 기준 순차 처리되며, 확인되는 대로 안내드리겠습니다.\n감사합니다.",
  },
  {
    key: "void",
    label: "적특 규정 안내",
    text:
      "안녕하세요.\n적특(무효) 및 경기 취소 처리는 해당 게임사·리그 규정 및 당사 운영 정책에 따릅니다.\n자세한 사항은 이벤트/스포츠 규정 안내를 참고해 주시기 바랍니다.",
  },
  {
    key: "arb",
    label: "양방 의심 경고",
    text:
      "안녕하세요.\n계좌·배팅 패턴 상 양방(헤지) 배팅이 의심되어 추가 검토 중입니다.\n사실 확인 전까지 출금이 지연되거나 제한될 수 있음을 안내드립니다.",
  },
  {
    key: "event",
    label: "이벤트 안내",
    text:
      "안녕하세요.\n이벤트 참여 조건·지급 일정은 공지된 규정을 기준으로 합니다.\n추가 문의 사항이 있으면 회신 부탁드립니다.",
  },
];

type ListItem = {
  id: number;
  user_id: number;
  user_login_id: string;
  site_id: string;
  category: string;
  title: string;
  status: string;
  created_at: string | null;
  has_reply: boolean;
};

type Detail = {
  ticket: {
    id: number;
    user_id: number;
    site_id: string;
    category: string;
    title: string;
    body: string;
    attached_bet_ids: number[];
    status: string;
    admin_reply: string | null;
    replied_at: string | null;
    replied_by_id: number | null;
    created_at: string | null;
  };
  user: { id: number; login_id: string; display_name: string | null };
  user_summary: {
    registered_at: string | null;
    member_level: number;
    total_deposit_approved: string;
    total_withdraw_approved: string;
    bad_actor: boolean;
    game_money_balance: string;
  };
};

const CAT_LABEL: Record<string, string> = {
  CHARGE: "충전",
  WITHDRAW: "환전",
  GAME_VOID: "게임/적특",
  EVENT: "이벤트",
  OTHER: "기타",
};

export function SupportTicketDashboard() {
  const token = useAuthStore((s) => s.token);
  const base = publicApiBase();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [replyText, setReplyText] = useState("");

  const listQ = useQuery({
    queryKey: ["admin", "support-tickets", token ?? "", statusFilter],
    queryFn: async () => {
      if (!base || !token) throw new Error("no token");
      const q = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const r = await adminFetch(`${base}/admin/support/tickets${q}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{ items: ListItem[]; total: number }>;
    },
    enabled: Boolean(token && base),
    refetchInterval: 12_000,
    staleTime: 6_000,
  });

  const items = listQ.data?.items ?? [];
  const effectiveId = selectedId ?? items[0]?.id ?? null;

  useEffect(() => {
    if (items.length && selectedId == null) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId]);

  const detailQ = useQuery({
    queryKey: ["admin", "support-ticket", effectiveId, token ?? ""],
    queryFn: async () => {
      if (!base || !token || effectiveId == null) throw new Error("no");
      const r = await adminFetch(`${base}/admin/support/tickets/${effectiveId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<Detail>;
    },
    enabled: Boolean(token && base && effectiveId != null),
  });

  useEffect(() => {
    const t = detailQ.data?.ticket;
    if (t) setReplyText(t.admin_reply ?? "");
  }, [detailQ.data?.ticket?.id, detailQ.data?.ticket?.admin_reply]);

  const replyM = useMutation({
    mutationFn: async () => {
      if (!base || !token || effectiveId == null) throw new Error("no");
      const r = await adminFetch(`${base}/admin/support/tickets/${effectiveId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ admin_reply: replyText, status: "ANSWERED" }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { detail?: string };
        throw new Error(typeof j?.detail === "string" ? j.detail : await r.text());
      }
      return r.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "support-tickets"] });
      void qc.invalidateQueries({ queryKey: ["admin", "support-ticket"] });
    },
  });

  const detail = detailQ.data;
  const showDetail = effectiveId != null && detail?.ticket.id === effectiveId;

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4 lg:flex-row">
      {/* 목록 */}
      <div
        className="flex w-full flex-shrink-0 flex-col rounded-2xl border border-cyan-500/25 bg-[#0f172a]/95 lg:w-[380px]"
        style={{ boxShadow: "0 0 40px -12px rgba(34, 211, 238, 0.25)" }}
      >
        <div className="border-b border-cyan-500/20 p-4">
          <h2 className="bg-gradient-to-r from-cyan-300 to-emerald-300 bg-clip-text text-lg font-bold text-transparent">
            1:1 문의 큐
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
            >
              <option value="">전체 상태</option>
              <option value="OPEN">OPEN</option>
              <option value="ANSWERED">ANSWERED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {listQ.isLoading ? (
            <p className="p-4 text-sm text-slate-500">불러오는 중…</p>
          ) : listQ.isError ? (
            <p className="p-4 text-sm text-red-400">{(listQ.error as Error).message}</p>
          ) : (
            <ul className="space-y-1">
              {items.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left text-xs transition ${
                      effectiveId === row.id
                        ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-100"
                        : "border-slate-700/60 bg-slate-900/40 text-slate-300 hover:border-cyan-500/30"
                    }`}
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-mono text-cyan-300/90">#{row.id}</span>
                      <span
                        className={
                          row.status === "OPEN" ? "text-amber-300" : "text-emerald-400/90"
                        }
                      >
                        {row.status}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 font-medium text-slate-200">{row.title}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">{row.user_login_id}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 상세 */}
      <div className="min-h-[480px] flex-1 rounded-2xl border border-emerald-500/20 bg-[#111827]/90 p-5 shadow-[0_0_36px_-14px_rgba(16,185,129,0.28)]">
        {effectiveId == null ? (
          <p className="text-sm text-slate-500">목록에서 문의를 선택하세요.</p>
        ) : detailQ.isLoading ? (
          <p className="text-sm text-slate-500">상세 로드 중…</p>
        ) : detailQ.isError ? (
          <p className="text-sm text-red-400">{(detailQ.error as Error).message}</p>
        ) : showDetail && detail ? (
          <div className="space-y-4">
            {/* 유저 미니 프로필 */}
            <div className="flex flex-wrap items-stretch justify-between gap-3">
              <div
                className="min-w-[220px] flex-1 rounded-xl border border-amber-400/35 bg-gradient-to-br from-amber-500/10 to-yellow-600/5 p-4"
                style={{ boxShadow: "0 0 28px -10px rgba(251, 191, 36, 0.35)" }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/80">
                  Member Intel
                </p>
                <p className="mt-1 font-mono text-lg font-bold text-amber-100">
                  {detail.user.login_id}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-400">
                  <dt>가입일</dt>
                  <dd className="text-right text-slate-200">
                    {detail.user_summary.registered_at?.slice(0, 10) ?? "—"}
                  </dd>
                  <dt>총 충전</dt>
                  <dd className="text-right font-mono text-emerald-300/90">
                    {formatMoneyInt(detail.user_summary.total_deposit_approved)}
                  </dd>
                  <dt>총 환전</dt>
                  <dd className="text-right font-mono text-cyan-300/90">
                    {formatMoneyInt(detail.user_summary.total_withdraw_approved)}
                  </dd>
                  <dt>등급</dt>
                  <dd className="text-right text-slate-200">Lv.{detail.user_summary.member_level}</dd>
                  <dt>게임머니</dt>
                  <dd className="text-right font-mono text-slate-200">
                    {formatMoneyInt(detail.user_summary.game_money_balance)}
                  </dd>
                  <dt>블랙(악성)</dt>
                  <dd className="text-right">
                    {detail.user_summary.bad_actor ? (
                      <span className="rounded bg-rose-600/80 px-2 py-0.5 text-[10px] font-bold text-white">
                        FLAGGED
                      </span>
                    ) : (
                      <span className="text-emerald-400/90">정상</span>
                    )}
                  </dd>
                </dl>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
                <span className="rounded border border-slate-600 px-2 py-0.5">
                  {CAT_LABEL[detail.ticket.category] ?? detail.ticket.category}
                </span>
                <span>#{detail.ticket.id}</span>
              </div>
              <h3 className="mt-2 text-lg font-semibold text-slate-100">{detail.ticket.title}</h3>
              <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-700/80 bg-slate-950/60 p-4 text-sm leading-relaxed text-slate-300">
                {detail.ticket.body}
              </pre>
              {detail.ticket.attached_bet_ids?.length ? (
                <p className="mt-2 text-xs text-cyan-400/80">
                  첨부 배팅 ID: {detail.ticket.attached_bet_ids.join(", ")}
                </p>
              ) : null}
            </div>

            <div className="border-t border-slate-700/80 pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-emerald-400/90">
                운영 답변
              </p>
              <div className="mb-2 flex flex-wrap gap-2">
                {MACROS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setReplyText(m.text)}
                    className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/20"
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={8}
                className="w-full rounded-xl border border-slate-600 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                placeholder="답변 내용을 입력하세요. 매크로 버튼으로 초안을 넣을 수 있습니다."
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={replyM.isPending}
                  onClick={() => replyM.mutate()}
                  className="rounded-xl border border-amber-400/50 bg-amber-500/20 px-5 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/30 disabled:opacity-50"
                >
                  {replyM.isPending ? "저장 중…" : "답변 등록 (ANSWERED)"}
                </button>
              </div>
              {replyM.isError ? (
                <p className="mt-2 text-sm text-red-400">
                  {(replyM.error as Error).message}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
