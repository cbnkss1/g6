"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type Row = {
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
    title: string;
    body: string;
    status: string;
    admin_reply: string | null;
    replied_at: string | null;
    created_at: string | null;
  };
};

export default function SuperInquiryPage() {
  const token = useAuthStore((s) => s.token);
  const base = publicApiBase();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const listQ = useQuery({
    queryKey: ["admin", "partner-to-super", token ?? ""],
    queryFn: async () => {
      if (!base || !token) throw new Error("no token");
      const r = await adminFetch(`${base}/admin/support/partner-to-super`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{ items: Row[] }>;
    },
    enabled: Boolean(token && base),
  });

  const detailQ = useQuery({
    queryKey: ["admin", "support-ticket-detail", selectedId, token ?? ""],
    queryFn: async () => {
      if (!base || !token || selectedId == null) throw new Error("no id");
      const r = await adminFetch(`${base}/admin/support/tickets/${selectedId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<Detail>;
    },
    enabled: Boolean(token && base && selectedId != null),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!base || !token) throw new Error("로그인이 필요합니다.");
      const r = await adminFetch(`${base}/admin/support/partner-to-super`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      setTitle("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["admin", "partner-to-super"] });
    },
  });

  const items = listQ.data?.items ?? [];

  return (
    <div className="quantum-shell mx-auto max-w-[960px] space-y-6 px-3 py-4 sm:px-5">
      <header className="quantum-hero px-5 py-5 sm:px-7 sm:py-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/90">슈퍼관리자</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">슈퍼관리자 문의</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          운영·정산·계좌 등 <strong className="text-slate-300">슈퍼관리자에게만</strong> 전달되는 1:1 문의입니다. 플레이어 고객센터(
          <span className="text-slate-500">/support</span>)와 별도로 관리됩니다.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-slate-200">새 문의 작성</h2>
          <div className="mt-4 space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목"
              className="admin-touch-input w-full rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-premium/40"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="문의 내용을 입력하세요."
              className="admin-touch-input w-full resize-none rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-200 outline-none focus:border-premium/40"
            />
            <button
              type="button"
              disabled={createMut.isPending || !title.trim() || !body.trim()}
              onClick={() => createMut.mutate()}
              className="admin-touch-btn w-full rounded-xl border border-premium/40 bg-premium/15 py-3 text-sm font-semibold text-premium hover:bg-premium/25 disabled:opacity-40"
            >
              {createMut.isPending ? "등록 중…" : "문의하기"}
            </button>
            {createMut.isError ? (
              <p className="text-xs text-red-400">{(createMut.error as Error).message}</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-slate-200">내 문의 목록</h2>
          {listQ.isLoading ? <p className="mt-4 text-sm text-slate-500">불러오는 중…</p> : null}
          {listQ.isError ? (
            <p className="mt-4 text-sm text-red-400">{(listQ.error as Error).message}</p>
          ) : null}
          {!listQ.isLoading && items.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">등록한 문의가 없습니다.</p>
          ) : null}
          <ul className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {items.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(it.id)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                    selectedId === it.id
                      ? "border-premium/50 bg-premium/10 text-slate-100"
                      : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <span className="line-clamp-1 font-medium text-slate-200">{it.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                    {it.created_at ? new Date(it.created_at).toLocaleString("ko-KR") : ""}
                    <span
                      className={`rounded px-1.5 py-0.5 ${
                        it.has_reply ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200"
                      }`}
                    >
                      {it.has_reply ? "답변됨" : "대기"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {selectedId != null && detailQ.data ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-slate-200">상세</h2>
          <p className="mt-2 text-base font-medium text-slate-100">{detailQ.data.ticket.title}</p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-400">{detailQ.data.ticket.body}</p>
          {detailQ.data.ticket.admin_reply ? (
            <div className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400/90">슈퍼관리자 답변</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-emerald-100/90">{detailQ.data.ticket.admin_reply}</p>
              {detailQ.data.ticket.replied_at ? (
                <p className="mt-2 text-[10px] text-emerald-600/90">
                  {new Date(detailQ.data.ticket.replied_at).toLocaleString("ko-KR")}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">아직 답변이 없습니다.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
