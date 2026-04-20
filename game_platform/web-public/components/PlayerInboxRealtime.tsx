"use client";

/**
 * 로그인 플레이어: 관리자 쪽지·1:1 문의 답변 실시간 알림 (WS + REST 폴링 폴백).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { usePlayerAuth } from "@/lib/playerAuthContext";
import { playPlayerMemoBeep, playPlayerSupportReplyBeep } from "@/lib/playerInboxBeep";
import {
  playerListNotifications,
  playerSupportListTickets,
  type PlayerNotificationItem,
  type SupportTicketPublic,
} from "@/lib/playerApi";
import { publicPlayerWsUrl } from "@/lib/publicApiBase";

type WsMsg = {
  type?: string;
  payload?: Record<string, string | number | undefined | null>;
};

type ToastRow = {
  key: string;
  kind: "memo" | "support";
  title: string;
  subtitle: string;
};

function pushToast(
  setToasts: React.Dispatch<React.SetStateAction<ToastRow[]>>,
  row: ToastRow,
) {
  setToasts((prev) => [row, ...prev.filter((x) => x.key !== row.key)].slice(0, 3));
}

export function PlayerInboxRealtime() {
  const router = useRouter();
  const { token, user, hydrated } = usePlayerAuth();
  const [toasts, setToasts] = useState<ToastRow[]>([]);
  const seen = useRef<Set<string>>(new Set());

  const memoBaseline = useRef<number | null>(null);
  const supportReplySeen = useRef<Set<string>>(new Set());
  const supportBaselineDone = useRef(false);

  const dismiss = useCallback((key: string) => {
    setToasts((t) => t.filter((x) => x.key !== key));
  }, []);

  const onInboxEvent = useCallback(
    (msg: WsMsg) => {
      const t = msg.type;
      const p = msg.payload ?? {};
      if (t === "player_notification_new") {
        const id = Number(p.id);
        if (!Number.isFinite(id)) return;
        const dedupe = `memo-${id}`;
        if (seen.current.has(dedupe)) return;
        seen.current.add(dedupe);
        window.setTimeout(() => seen.current.delete(dedupe), 4000);
        const title = String(p.title || "새 쪽지");
        const imp = Boolean(p.is_important);
        playPlayerMemoBeep();
        pushToast(setToasts, {
          key: dedupe,
          kind: "memo",
          title: imp ? "관리자 쪽지 · 중요" : "관리자 쪽지",
          subtitle: `${imp ? "[중요] " : ""}${title.slice(0, 120)}`,
        });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("player-inbox-refresh"));
          window.dispatchEvent(new CustomEvent("player-notification-block-refresh"));
        }
      }
      if (t === "support_ticket_replied") {
        const id = Number(p.id);
        if (!Number.isFinite(id)) return;
        const dedupe = `sup-${id}`;
        if (seen.current.has(dedupe)) return;
        seen.current.add(dedupe);
        window.setTimeout(() => seen.current.delete(dedupe), 4000);
        const title = String(p.title || "문의");
        playPlayerSupportReplyBeep();
        pushToast(setToasts, {
          key: dedupe,
          kind: "support",
          title: "1:1 문의 답변",
          subtitle: title.slice(0, 120),
        });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("player-support-refresh"));
        }
      }
    },
    [],
  );

  useEffect(() => {
    const onWin = (ev: Event) => {
      const ce = ev as CustomEvent<WsMsg>;
      if (ce.detail) onInboxEvent(ce.detail);
    };
    window.addEventListener("player-inbox-notify", onWin as EventListener);
    return () => window.removeEventListener("player-inbox-notify", onWin as EventListener);
  }, [onInboxEvent]);

  useEffect(() => {
    if (!hydrated || !token || !user) return;
    const url = publicPlayerWsUrl();
    let ws: WebSocket | null = null;
    let closed = false;
    const connect = () => {
      if (closed) return;
      const u = `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
      ws = new WebSocket(u);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as WsMsg;
          onInboxEvent(msg);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (!closed) window.setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      closed = true;
      ws?.close();
    };
  }, [hydrated, token, user, onInboxEvent]);

  useEffect(() => {
    if (!hydrated || !token || !user) return;

    const poll = async () => {
      try {
        const memos = await playerListNotifications(token, 80);
        const items: PlayerNotificationItem[] = memos.items ?? [];
        if (items.length === 0) {
          if (memoBaseline.current === null) memoBaseline.current = 0;
        } else {
          const ids = items.map((x) => x.id).filter((n) => Number.isFinite(n));
          const maxId = Math.max(...ids);
          if (memoBaseline.current === null) {
            memoBaseline.current = maxId;
          } else {
            const b = memoBaseline.current;
            const newOnes = items
              .filter((x) => x.id > b)
              .sort((a, b) => a.id - b.id);
            for (const x of newOnes) {
              window.dispatchEvent(
                new CustomEvent("player-inbox-notify", {
                  detail: {
                    type: "player_notification_new",
                    payload: {
                      id: x.id,
                      title: x.title,
                      is_important: Boolean(x.is_important),
                    },
                  },
                }),
              );
            }
            memoBaseline.current = Math.max(b, maxId);
          }
        }

        const st = await playerSupportListTickets(token, 60);
        const tickets: SupportTicketPublic[] = st.items ?? [];
        if (!supportBaselineDone.current) {
          for (const t of tickets) {
            if (t.admin_reply?.trim() && t.replied_at) {
              supportReplySeen.current.add(`${t.id}:${t.replied_at}`);
            }
          }
          supportBaselineDone.current = true;
        } else {
          for (const t of tickets) {
            if (!t.admin_reply?.trim() || !t.replied_at) continue;
            const key = `${t.id}:${t.replied_at}`;
            if (supportReplySeen.current.has(key)) continue;
            supportReplySeen.current.add(key);
            window.dispatchEvent(
              new CustomEvent("player-inbox-notify", {
                detail: {
                  type: "support_ticket_replied",
                  payload: { id: t.id, title: t.title },
                },
              }),
            );
          }
        }
      } catch (e) {
        console.error("PlayerInbox poll", e);
      }
    };

    void poll();
    const id = window.setInterval(poll, 12_000);
    return () => window.clearInterval(id);
  }, [hydrated, token, user]);

  if (!user || !token || toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[min(100vw-1.5rem,22rem)] flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.key}
          className="pointer-events-auto overflow-hidden rounded-2xl border border-violet-400/20 bg-slate-950/85 shadow-[0_8px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        >
          <div className="relative px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300/90">
              {t.kind === "memo" ? "알림" : "고객센터"}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-50">{t.title}</p>
            <p className="mt-0.5 line-clamp-3 text-xs text-slate-400">{t.subtitle}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {t.kind === "memo" ? (
                <button
                  type="button"
                  onClick={() => {
                    router.push("/messages");
                    dismiss(t.key);
                  }}
                  className="rounded-lg bg-gradient-to-r from-violet-500/90 to-fuchsia-600/90 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  쪽지함 열기
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    router.push("/support");
                    dismiss(t.key);
                  }}
                  className="rounded-lg bg-gradient-to-r from-cyan-500/90 to-sky-600/90 px-3 py-1.5 text-xs font-semibold text-slate-950"
                >
                  문의 보기
                </button>
              )}
              <Link
                href="/"
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
                onClick={() => dismiss(t.key)}
              >
                닫고 홈
              </Link>
              <button
                type="button"
                onClick={() => dismiss(t.key)}
                className="ml-auto text-[11px] text-slate-500 hover:text-slate-300"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
