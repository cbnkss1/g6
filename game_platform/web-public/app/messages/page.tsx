"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { SiteHeader } from "@/components/SiteHeader";
import { usePlayerAuth } from "@/lib/playerAuthContext";
import {
  playerDeleteAllNotifications,
  playerDeleteNotification,
  playerListNotifications,
  playerMarkNotificationRead,
  type PlayerNotificationItem,
} from "@/lib/playerApi";

export default function MessagesPage() {
  const { user, hydrated, token, openLogin } = usePlayerAuth();
  const [items, setItems] = useState<PlayerNotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [purgeBusy, setPurgeBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await playerListNotifications(token, 200);
      setItems(r.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const fn = () => void load();
    window.addEventListener("player-inbox-refresh", fn);
    return () => window.removeEventListener("player-inbox-refresh", fn);
  }, [load]);

  const bumpBlockRefresh = () => {
    window.dispatchEvent(new CustomEvent("player-notification-block-refresh"));
  };

  const toggle = async (row: PlayerNotificationItem) => {
    const next = openId === row.id ? null : row.id;
    setOpenId(next);
    if (next === row.id && !row.read_at && token) {
      try {
        await playerMarkNotificationRead(token, row.id);
        setItems((prev) =>
          prev.map((x) => (x.id === row.id ? { ...x, read_at: new Date().toISOString() } : x)),
        );
        bumpBlockRefresh();
      } catch {
        /* 읽음 실패해도 본문은 표시 */
      }
    }
  };

  async function onDeleteOne(id: number) {
    if (!token) return;
    if (!window.confirm("이 쪽지를 쪽지함에서 삭제할까요? 삭제 후에는 목록에서 사라집니다.")) return;
    setBusyId(id);
    setErr(null);
    try {
      await playerDeleteNotification(token, id);
      setItems((prev) => prev.filter((x) => x.id !== id));
      if (openId === id) setOpenId(null);
      bumpBlockRefresh();
      window.dispatchEvent(new CustomEvent("player-inbox-refresh"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function onDeleteAll() {
    if (!token || items.length === 0) return;
    if (
      !window.confirm(
        `받은 쪽지 ${items.length}건을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
      )
    ) {
      return;
    }
    setPurgeBusy(true);
    setErr(null);
    try {
      await playerDeleteAllNotifications(token);
      setItems([]);
      setOpenId(null);
      bumpBlockRefresh();
      window.dispatchEvent(new CustomEvent("player-inbox-refresh"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "전체 삭제에 실패했습니다.");
    } finally {
      setPurgeBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-slate-100">쪽지함</h1>
            <p className="mt-1 text-sm text-slate-500">
              관리자가 보낸 알림은 읽은 뒤에도 보관되며, 필요할 때만 삭제하면 됩니다.
            </p>
          </div>
          {user && token && items.length > 0 ? (
            <button
              type="button"
              disabled={purgeBusy}
              onClick={() => void onDeleteAll()}
              className="inline-flex items-center justify-center rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm font-medium text-rose-200/95 transition hover:bg-rose-500/20 disabled:opacity-50"
            >
              {purgeBusy ? "삭제 중…" : "전체 삭제"}
            </button>
          ) : null}
        </div>

        {!hydrated ? (
          <p className="text-sm text-slate-500">불러오는 중…</p>
        ) : !user || !token ? (
          <div className="glass-panel space-y-4 p-8 text-center">
            <p className="text-sm text-slate-400">로그인 후 관리자가 보낸 알림을 확인할 수 있습니다.</p>
            <button
              type="button"
              onClick={() => openLogin()}
              className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-600 px-6 py-2.5 text-sm font-medium text-white"
            >
              로그인
            </button>
          </div>
        ) : (
          <>
            {err ? (
              <p className="mb-4 rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                {err}
              </p>
            ) : null}
            {loading && items.length === 0 ? (
              <p className="text-sm text-slate-500">목록 불러오는 중…</p>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.04] to-transparent px-6 py-12 text-center">
                <p className="text-sm text-slate-500">받은 쪽지가 없습니다.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {items.map((row) => (
                  <li
                    key={row.id}
                    className="overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-slate-900/80 to-slate-950/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  >
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void toggle(row)}
                        className="min-w-0 flex-1 px-4 py-3 text-left transition hover:bg-white/[0.04]"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-slate-100">{row.title}</span>
                          {row.is_important ? (
                            <span className="rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200/95">
                              중요
                            </span>
                          ) : null}
                          {!row.read_at ? (
                            <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-medium text-cyan-200/90">
                              NEW
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-600">
                          {row.created_at?.slice(0, 16).replace("T", " ") ?? ""}
                        </p>
                      </button>
                      <div className="flex shrink-0 flex-col justify-center border-l border-white/[0.06] p-2">
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void onDeleteOne(row.id);
                          }}
                          className="rounded-lg px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-rose-500/15 hover:text-rose-200 disabled:opacity-40"
                          title="쪽지함에서 삭제"
                        >
                          {busyId === row.id ? "…" : "삭제"}
                        </button>
                      </div>
                    </div>
                    {openId === row.id ? (
                      <div className="border-t border-white/[0.06] bg-black/20 px-4 py-4">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{row.body}</p>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <p className="mt-10 text-center">
          <Link href="/" className="text-sm text-cyan-400/90 hover:underline">
            메인으로
          </Link>
        </p>
      </main>
    </div>
  );
}
