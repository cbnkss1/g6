"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";

import { publicApiBase } from "@/lib/publicApiBase";

type PopupItem = {
  id: number;
  title: string;
  body_html: string;
  nw_left: number;
  nw_top: number;
  nw_width: number;
  nw_height: number;
};

const SNOOZE_STORAGE_KEY = "gp_site_popup_snooze_v1";

function defaultSiteId(): string {
  const v = process.env.NEXT_PUBLIC_DEFAULT_SITE_ID?.trim();
  return v || "a0000001-0000-4000-8000-000000000001";
}

function localDayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readSnoozedIdsForToday(): Set<number> {
  const out = new Set<number>();
  if (typeof window === "undefined") return out;
  try {
    const raw = localStorage.getItem(SNOOZE_STORAGE_KEY);
    if (!raw) return out;
    const obj = JSON.parse(raw) as Record<string, string>;
    const today = localDayKey();
    for (const [idStr, day] of Object.entries(obj)) {
      if (day === today) out.add(Number(idStr));
    }
  } catch {
    /* ignore */
  }
  return out;
}

function snoozePopupForToday(popupId: number): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(SNOOZE_STORAGE_KEY);
    const obj: Record<string, string> = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    obj[String(popupId)] = localDayKey();
    const today = localDayKey();
    for (const k of Object.keys(obj)) {
      if (obj[k] !== today) delete obj[k];
    }
    localStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

export function SitePopupHost() {
  const [items, setItems] = useState<PopupItem[]>([]);
  const [closed, setClosed] = useState<Set<number>>(() => new Set());
  const [dontShowToday, setDontShowToday] = useState<Record<number, boolean>>({});
  const [device, setDevice] = useState<"pc" | "mobile">("pc");

  useEffect(() => {
    const mq = () => {
      setDevice(typeof window !== "undefined" && window.innerWidth < 768 ? "mobile" : "pc");
    };
    mq();
    window.addEventListener("resize", mq);
    return () => window.removeEventListener("resize", mq);
  }, []);

  useEffect(() => {
    const base = publicApiBase();
    const sid = defaultSiteId();
    let cancel = false;
    (async () => {
      try {
        const r = await fetch(
          `${base}/api/public/site-popups?site_id=${encodeURIComponent(sid)}&device=${device}`,
          { cache: "no-store" },
        );
        const data = (await r.json().catch(() => null)) as { items?: PopupItem[] } | null;
        if (cancel || !data?.items) return;
        const snoozed = readSnoozedIdsForToday();
        setItems(data.items.filter((p) => !snoozed.has(p.id)));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [device]);

  const visiblePopups = useMemo(
    () => items.filter((p) => !closed.has(p.id)),
    [items, closed],
  );

  const handleClose = useCallback((id: number) => {
    if (dontShowToday[id]) {
      snoozePopupForToday(id);
    }
    setClosed((prev) => new Set(prev).add(id));
  }, [dontShowToday]);

  const openCount = visiblePopups.length;

  if (openCount === 0) return null;

  return (
    <>
      <AnimatePresence>
        {openCount > 0 ? (
          <motion.div
            key="popup-scrim"
            role="presentation"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="fixed inset-0 z-[99] bg-[#030712]/75 backdrop-blur-[3px]"
          />
        ) : null}
      </AnimatePresence>

      <div className="pointer-events-none fixed inset-0 z-[100]">
        <AnimatePresence>
          {visiblePopups.map((p, idx) => (
            <PopupPanel
              key={p.id}
              popup={p}
              device={device}
              zBase={100 + idx}
              dontShow={Boolean(dontShowToday[p.id])}
              onDontShowChange={(v) => setDontShowToday((prev) => ({ ...prev, [p.id]: v }))}
              onClose={() => handleClose(p.id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

function PopupPanel({
  popup: p,
  device,
  zBase,
  dontShow,
  onDontShowChange,
  onClose,
}: {
  popup: PopupItem;
  device: "pc" | "mobile";
  zBase: number;
  dontShow: boolean;
  onDontShowChange: (v: boolean) => void;
  onClose: () => void;
}) {
  const isMobile = device === "mobile";

  const positionStyle = isMobile
    ? {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: `min(calc(100vw - 2rem), ${Math.max(320, p.nw_width)}px)`,
        maxHeight: "min(85vh, 560px)",
        height: "auto",
      }
    : {
        left: p.nw_left,
        top: p.nw_top,
        width: p.nw_width,
        height: p.nw_height,
        maxWidth: "calc(100vw - 24px)",
      };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className="pointer-events-auto absolute flex max-h-[90vh] flex-col overflow-hidden"
      style={{ ...positionStyle, zIndex: zBase }}
    >
      {/* 외곽 글로우 링 */}
      <div
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-90"
        style={{
          background:
            "linear-gradient(135deg, rgba(34,211,238,0.45), rgba(232,121,249,0.25), rgba(212,175,55,0.2))",
          filter: "blur(1px)",
        }}
      />
      <div className="relative flex max-h-[inherit] min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-slate-950/55 via-[#0a1628]/75 to-slate-950/65 shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_28px_90px_rgba(0,0,0,0.65),0_0_100px_rgba(34,211,238,0.07),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl">
        {/* 상단 스캔라인 느낌 */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent"
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-x-6 top-0 h-8 bg-gradient-to-b from-cyan-400/10 to-transparent blur-xl" />

        <header className="relative shrink-0 border-b border-white/[0.07] px-4 pb-3 pt-4 sm:px-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-cyan-300/75">
            Quantum · Notice
          </p>
          <h2 className="mt-1.5 font-display text-xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-100 via-white to-fuchsia-200/90 sm:text-[1.35rem]">
            {p.title}
          </h2>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 text-[13px] leading-relaxed text-slate-200/95 sm:px-5 [&_a]:text-cyan-300 [&_a]:underline-offset-2 hover:[&_a]:text-cyan-200 [&_img]:max-w-full [&_img]:rounded-lg [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4"
          dangerouslySetInnerHTML={{ __html: p.body_html }}
        />

        <footer className="relative shrink-0 border-t border-white/[0.06] bg-black/25 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="group flex cursor-pointer select-none items-center gap-2.5 text-xs text-slate-400 transition hover:text-slate-300">
              <span className="relative flex h-4 w-4 items-center justify-center rounded border border-cyan-500/35 bg-slate-950/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] group-hover:border-cyan-400/50">
                <input
                  type="checkbox"
                  checked={dontShow}
                  onChange={(e) => onDontShowChange(e.target.checked)}
                  className="peer sr-only"
                />
                <span
                  className="pointer-events-none h-2 w-2 rounded-sm bg-gradient-to-br from-cyan-400 to-fuchsia-500 opacity-0 shadow-[0_0_8px_rgba(34,211,238,0.8)] transition peer-checked:opacity-100"
                  aria-hidden
                />
              </span>
              <span className="leading-snug">
                오늘 하루 이 창 보지 않기
                <span className="mt-0.5 block text-[10px] font-normal text-slate-600">
                  자정 이후 다시 표시됩니다
                </span>
              </span>
            </label>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex shrink-0 items-center justify-center rounded-xl border border-cyan-400/30 bg-gradient-to-r from-cyan-500/20 via-slate-800/80 to-fuchsia-600/20 px-6 py-2.5 text-sm font-semibold text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,0.15),inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-cyan-300/45 hover:shadow-[0_0_32px_rgba(34,211,238,0.22)] active:scale-[0.99]"
            >
              확인
            </button>
          </div>
        </footer>
      </div>
    </motion.div>
  );
}
