"use client";

import { useEffect, useState } from "react";

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

function defaultSiteId(): string {
  const v = process.env.NEXT_PUBLIC_DEFAULT_SITE_ID?.trim();
  return v || "a0000001-0000-4000-8000-000000000001";
}

export function SitePopupHost() {
  const [items, setItems] = useState<PopupItem[]>([]);
  const [closed, setClosed] = useState<Set<number>>(() => new Set());
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
        if (!cancel && data?.items) setItems(data.items);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [device]);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]">
      {items.map((p) => {
        if (closed.has(p.id)) return null;
        const left = device === "mobile" ? 12 : p.nw_left;
        const top = device === "mobile" ? 24 : p.nw_top;
        return (
          <div
            key={p.id}
            className="pointer-events-auto absolute flex max-h-[90vh] flex-col overflow-hidden rounded-xl border border-premium/25 bg-[#060b14]/95 shadow-[0_0_40px_rgba(0,0,0,0.65)] backdrop-blur-md"
            style={{
              left,
              top,
              width: device === "mobile" ? `min(100%, ${p.nw_width}px)` : p.nw_width,
              height: p.nw_height,
              maxWidth: "calc(100vw - 24px)",
            }}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-black/30 px-3 py-2">
              <span className="truncate text-sm font-semibold text-premium">{p.title}</span>
              <button
                type="button"
                onClick={() => setClosed((prev) => new Set(prev).add(p.id))}
                className="shrink-0 rounded px-2 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
              >
                닫기
              </button>
            </div>
            <div
              className="min-h-0 flex-1 overflow-auto px-3 py-2 text-sm leading-relaxed text-slate-300 [&_a]:text-cyan-400 [&_img]:max-w-full"
              dangerouslySetInnerHTML={{ __html: p.body_html }}
            />
          </div>
        );
      })}
    </div>
  );
}
