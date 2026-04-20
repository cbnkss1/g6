"use client";

/**
 * 슈퍼관리자 전역 실시간 알림: 입출금 신청 · 1:1 문의 접수 시
 * 반투명 글래스 토스트 + 효과음 + 빠른 승인/이동.
 * - 1차: WebSocket `admin-ops-notify` (Nginx가 `/admin/ws` 업그레이드를 넘겨줘야 함)
 * - 폴백: 동일 이벤트를 REST 폴링으로 발생(WS 미연결·0세션일 때도 알림 가능)
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { adminFetch } from "@/lib/adminFetch";
import { playCashRequestBeep, playSupportTicketBeep } from "@/lib/playCashBeep";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type WsPayload = Record<string, string | number | undefined | null>;

type ToastRow = {
  key: string;
  kind: "cash" | "support";
  title: string;
  subtitle: string;
  cashId?: number;
  ticketId?: number;
  requestType?: string;
};

const CAT_KO: Record<string, string> = {
  CHARGE: "충전",
  WITHDRAW: "환전",
  GAME_VOID: "게임/적특",
  EVENT: "이벤트",
  OTHER: "기타",
  PARTNER_TO_SUPER: "파트너→슈퍼",
};

export function SuperOpsToastLayer() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const token = useAuthStore((s) => s.token);
  const base = publicApiBase();
  const [toasts, setToasts] = useState<ToastRow[]>([]);
  const seen = useRef<Set<string>>(new Set());
  /** 폴링으로 이미 본 최대 id — 최초 응답으로만 시드하고, 그 이후 신규만 토스트 */
  const cashPollBaselineRef = useRef<number | null>(null);
  const supportPollBaselineRef = useRef<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const isSuper = role === "super_admin";

  const dismiss = useCallback((key: string) => {
    setToasts((t) => t.filter((x) => x.key !== key));
  }, []);

  const approveCash = useCallback(
    async (id: number, key: string) => {
      if (!base || !token) return;
      setBusyId(id);
      try {
        const r = await adminFetch(`${base}/admin/cash/requests/${id}/approve`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reason: "" }),
        });
        if (!r.ok) throw new Error(await r.text());
        dismiss(key);
      } catch (e) {
        console.error(e);
        alert(e instanceof Error ? e.message : "승인 실패");
      } finally {
        setBusyId(null);
      }
    },
    [base, dismiss, token],
  );

  useEffect(() => {
    if (!isSuper) return;

    const onNotify = (ev: Event) => {
      const ce = ev as CustomEvent<{ type?: string; payload?: WsPayload }>;
      const msg = ce.detail;
      if (!msg?.type) return;

      if (msg.type === "cash_request_new") {
        const p = msg.payload ?? {};
        const id = Number(p.id);
        if (!Number.isFinite(id)) return;
        const dedupe = `cash-${id}`;
        if (seen.current.has(dedupe)) return;
        seen.current.add(dedupe);
        window.setTimeout(() => seen.current.delete(dedupe), 4000);

        const rt = String(p.request_type || "").toUpperCase();
        const label = rt === "WITHDRAW" ? "출금(환전) 신청" : "입금 신청";
        const login = p.login_id != null ? String(p.login_id) : `user #${p.user_id}`;
        const amt = p.amount != null ? String(p.amount) : "";
        playCashRequestBeep();
        setToasts((prev) => {
          const row: ToastRow = {
            key: dedupe,
            kind: "cash",
            title: label,
            subtitle: `${login} · ${amt ? `${amt} 원` : "금액 확인"}`,
            cashId: id,
            requestType: rt,
          };
          return [row, ...prev.filter((x) => x.key !== dedupe)].slice(0, 3);
        });
      }

      if (msg.type === "support_ticket_new") {
        const p = msg.payload ?? {};
        const id = Number(p.id);
        if (!Number.isFinite(id)) return;
        const dedupe = `sup-${id}`;
        if (seen.current.has(dedupe)) return;
        seen.current.add(dedupe);
        window.setTimeout(() => seen.current.delete(dedupe), 4000);

        const cat = String(p.category || "");
        const catLabel = CAT_KO[cat] || cat;
        const title = String(p.title || "").slice(0, 80) || "새 문의";
        const src = p.source === "partner" ? "파트너" : "플레이어";
        playSupportTicketBeep();
        setToasts((prev) => {
          const row: ToastRow = {
            key: dedupe,
            kind: "support",
            title: `1:1 문의 · ${catLabel}`,
            subtitle: `[${src}] ${title}`,
            ticketId: id,
          };
          return [row, ...prev.filter((x) => x.key !== dedupe)].slice(0, 3);
        });
      }
    };

    window.addEventListener("admin-ops-notify", onNotify as EventListener);
    return () => window.removeEventListener("admin-ops-notify", onNotify as EventListener);
  }, [isSuper]);

  useEffect(() => {
    if (!isSuper || !base || !token) return;

    const poll = async () => {
      try {
        const cr = await adminFetch(
          `${base}/admin/cash/requests?status=PENDING&limit=50&sort=recent`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          },
        );
        if (cr.ok) {
          const j = (await cr.json()) as { items?: Array<Record<string, unknown>> };
          const items = Array.isArray(j.items) ? j.items : [];
          if (items.length === 0) {
            if (cashPollBaselineRef.current === null) cashPollBaselineRef.current = 0;
          } else {
            const ids = items.map((x) => Number(x.id)).filter((n) => Number.isFinite(n));
            const maxId = Math.max(...ids);
            if (cashPollBaselineRef.current === null) {
              cashPollBaselineRef.current = maxId;
            } else {
              const b = cashPollBaselineRef.current;
              const newOnes = items
                .filter((x) => Number(x.id) > b)
                .sort((a, b) => Number(a.id) - Number(b.id));
              for (const x of newOnes) {
                window.dispatchEvent(
                  new CustomEvent("admin-ops-notify", {
                    detail: {
                      type: "cash_request_new",
                      payload: {
                        id: x.id,
                        user_id: x.user_id,
                        login_id: x.login_id,
                        amount: x.amount,
                        request_type: x.request_type,
                      },
                    },
                  }),
                );
              }
              cashPollBaselineRef.current = Math.max(b, maxId);
            }
          }
        }

        const sr = await adminFetch(`${base}/admin/support/tickets?queue=pending&limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (sr.ok) {
          const j = (await sr.json()) as { items?: Array<Record<string, unknown>> };
          const items = Array.isArray(j.items) ? j.items : [];
          if (items.length === 0) {
            if (supportPollBaselineRef.current === null) supportPollBaselineRef.current = 0;
          } else {
            const ids = items.map((x) => Number(x.id)).filter((n) => Number.isFinite(n));
            const maxId = Math.max(...ids);
            if (supportPollBaselineRef.current === null) {
              supportPollBaselineRef.current = maxId;
            } else {
              const b = supportPollBaselineRef.current;
              const newOnes = items
                .filter((x) => Number(x.id) > b)
                .sort((a, b) => Number(a.id) - Number(b.id));
              for (const x of newOnes) {
                const cat = String(x.category || "");
                const src = cat === "PARTNER_TO_SUPER" ? "partner" : "player";
                window.dispatchEvent(
                  new CustomEvent("admin-ops-notify", {
                    detail: {
                      type: "support_ticket_new",
                      payload: {
                        id: x.id,
                        category: cat,
                        title: x.title,
                        user_id: x.user_id,
                        source: src,
                      },
                    },
                  }),
                );
              }
              supportPollBaselineRef.current = Math.max(b, maxId);
            }
          }
        }
      } catch (e) {
        console.error("SuperOps poll", e);
      }
    };

    void poll();
    const id = window.setInterval(poll, 8_000);
    return () => window.clearInterval(id);
  }, [isSuper, base, token]);

  if (!isSuper || toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[min(100vw-1.5rem,22rem)] flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.key}
          className="pointer-events-auto overflow-hidden rounded-2xl border border-white/15 bg-slate-950/75 shadow-[0_8px_40px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-amber-500/10" />
          <div className="relative px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/90">
              {t.kind === "cash" ? "입출금 센터" : "고객센터"}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-50">{t.title}</p>
            <p className="mt-0.5 line-clamp-3 text-xs text-slate-400">{t.subtitle}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {t.kind === "cash" && t.cashId != null ? (
                <>
                  <button
                    type="button"
                    disabled={busyId === t.cashId}
                    onClick={() => void approveCash(t.cashId!, t.key)}
                    className="rounded-lg bg-gradient-to-r from-emerald-500/90 to-emerald-600/90 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.35)] disabled:opacity-50"
                  >
                    {busyId === t.cashId ? "처리 중…" : "바로 승인"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      router.push("/cash");
                      dismiss(t.key);
                    }}
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
                  >
                    콘솔 열기
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    router.push(`/support?ticket=${t.ticketId}`);
                    dismiss(t.key);
                  }}
                  className="rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/25"
                >
                  문의 열기
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(t.key)}
                className="ml-auto rounded-lg px-2 py-1.5 text-[11px] text-slate-500 hover:text-slate-300"
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
