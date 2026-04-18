"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { SiteHeader } from "@/components/SiteHeader";
import { usePlayerAuth } from "@/lib/playerAuthContext";
import {
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

  const toggle = async (row: PlayerNotificationItem) => {
    const next = openId === row.id ? null : row.id;
    setOpenId(next);
    if (next === row.id && !row.read_at && token) {
      try {
        await playerMarkNotificationRead(token, row.id);
        setItems((prev) =>
          prev.map((x) => (x.id === row.id ? { ...x, read_at: new Date().toISOString() } : x)),
        );
      } catch {
        /* 읽음 실패해도 본문은 표시 */
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="font-display mb-6 text-2xl font-semibold text-slate-100">쪽지</h1>

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
              <p className="text-sm text-slate-500">받은 쪽지가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {items.map((row) => (
                  <li key={row.id} className="glass-panel overflow-hidden">
                    <button
                      type="button"
                      onClick={() => void toggle(row)}
                      className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-white/5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-slate-200">{row.title}</span>
                        {!row.read_at ? (
                          <span className="ml-2 rounded bg-premium/20 px-1.5 py-0.5 text-[10px] text-premium-glow">
                            NEW
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-600">
                        {row.created_at?.slice(0, 16).replace("T", " ") ?? ""}
                      </span>
                    </button>
                    {openId === row.id ? (
                      <div className="border-t border-white/5 px-4 py-3">
                        <p className="whitespace-pre-wrap text-sm text-slate-400">{row.body}</p>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <p className="mt-8 text-center">
          <Link href="/" className="text-sm text-premium hover:underline">
            메인으로
          </Link>
        </p>
      </main>
    </div>
  );
}
