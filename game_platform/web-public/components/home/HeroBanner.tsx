"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { publicApiBase } from "@/lib/publicApiBase";

type Slide = {
  id: string | number;
  image_url?: string | null;
  title: string;
  subtitle: string;
  link_url?: string | null;
};

function defaultSiteId(): string {
  const v = process.env.NEXT_PUBLIC_DEFAULT_SITE_ID?.trim();
  return v || "a0000001-0000-4000-8000-000000000001";
}

const FALLBACK_SLIDES: Slide[] = [
  {
    id: "f1",
    title: "Quantum Elite — 라이브 스포츠",
    subtitle: "EPL · NBA · 글로벌 리그 실시간 배당. 중앙 메뉴에서 바로 입장하세요.",
  },
  {
    id: "f2",
    title: "카지노 & 슬롯",
    subtitle: "프리미엄 라이브 카지노와 슬롯 — 메인 지갑 연동, 원터치 전환.",
  },
  {
    id: "f3",
    title: "미니게임 · 파워볼",
    subtitle: "빠른 라운드와 실시간 통계. 하단 베팅 슬립으로 합산 배당을 확인하세요.",
  },
];

function SlideContent({
  slide,
  hasImage,
}: {
  slide: Slide;
  hasImage: boolean;
}) {
  const hasTitle = Boolean(slide.title?.trim());
  const hasSub = Boolean(slide.subtitle?.trim());

  if (!hasTitle && !hasSub) {
    return null;
  }

  return (
    <div
      className={
        hasImage
          ? "relative z-[1] max-w-2xl"
          : "relative z-[1] max-w-2xl rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.07] via-[#151515]/80 to-[#0a0a0a]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-6"
      }
    >
      {hasTitle ? (
        <h2
          className={
            hasImage
              ? "font-display text-2xl font-semibold leading-tight text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.85)] sm:text-3xl md:text-4xl"
              : "font-display text-2xl font-semibold leading-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-white to-amber-200/95 drop-shadow-[0_0_28px_rgba(34,211,238,0.35)] sm:text-3xl md:text-4xl"
          }
        >
          {slide.title}
        </h2>
      ) : null}
      {hasSub ? (
        <p
          className={
            hasImage
              ? "mt-2 text-sm leading-relaxed text-slate-100/90 drop-shadow-[0_1px_12px_rgba(0,0,0,0.9)] sm:text-base"
              : "mt-3 text-sm leading-relaxed text-slate-400 sm:text-base"
          }
        >
          {slide.subtitle}
        </p>
      ) : null}
    </div>
  );
}

export function HeroBanner() {
  const [slides, setSlides] = useState<Slide[]>(FALLBACK_SLIDES);
  const [idx, setIdx] = useState(0);
  const [device, setDevice] = useState<"pc" | "mobile">("pc");

  useEffect(() => {
    const mq = () => setDevice(typeof window !== "undefined" && window.innerWidth < 768 ? "mobile" : "pc");
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
          `${base}/api/public/hero-slides?site_id=${encodeURIComponent(sid)}&device=${device}`,
          { cache: "no-store" },
        );
        const data = (await r.json().catch(() => null)) as {
          items?: { id: number; image_url?: string | null; title?: string; subtitle?: string; link_url?: string | null }[];
        };
        if (cancel) return;
        if (!data?.items?.length) {
          setSlides(FALLBACK_SLIDES);
          setIdx(0);
          return;
        }
        const mapped: Slide[] = data.items.map((p) => ({
          id: p.id,
          image_url: p.image_url,
          title: (p.title || "").trim(),
          subtitle: (p.subtitle || "").trim(),
          link_url: p.link_url,
        }));
        setSlides(mapped);
        setIdx(0);
      } catch {
        /* keep fallback */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [device]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1) % slides.length);
    }, 6000);
    return () => window.clearInterval(t);
  }, [slides.length]);

  const current = useMemo(() => slides[idx] ?? slides[0], [slides, idx]);
  const img = (current.image_url || "").trim();
  const hasImage = Boolean(img);

  const innerBlock = (
    <AnimatePresence mode="wait">
      <motion.div
        key={String(current.id)}
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -24 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex min-h-[140px] flex-col justify-end sm:min-h-[200px]"
      >
        {hasImage ? (
          <>
            <img
              src={img}
              alt=""
              className="absolute inset-0 z-0 h-full w-full rounded-2xl object-cover"
              loading="lazy"
              decoding="async"
            />
            <div
              className="absolute inset-0 z-0 rounded-2xl bg-gradient-to-t from-black/85 via-black/35 to-black/10"
              aria-hidden
            />
            <div className="relative z-[1] px-5 pb-8 pt-10 sm:px-10 sm:pb-10 sm:pt-14">
              <SlideContent slide={current} hasImage />
            </div>
          </>
        ) : (
          <div className="relative px-5 py-8 sm:px-10 sm:py-10">
            <SlideContent slide={current} hasImage={false} />
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );

  const linked =
    (current.link_url || "").trim() ? (
      <a
        href={(current.link_url || "").trim()}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-2xl outline-none ring-offset-2 ring-offset-[#0d0d0d] focus-visible:ring-2 focus-visible:ring-cyan-400/50"
      >
        {innerBlock}
      </a>
    ) : (
      innerBlock
    );

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] via-[#1a1a1a] to-[#0d0d0d] shadow-[0_24px_80px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 50% at 20% 0%, rgba(34,211,238,0.12), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(212,175,55,0.08), transparent)",
        }}
      />
      <div className="relative min-h-[140px] sm:min-h-[160px]">
        <p className="absolute left-5 top-5 z-[2] text-[10px] font-bold uppercase tracking-[0.35em] text-cyan-400/90 sm:left-10 sm:top-6">
          Live Events
        </p>
        {linked}
        <div className="pointer-events-auto relative z-[2] flex gap-1.5 px-5 pb-5 sm:px-10">
          {slides.map((s, i) => (
            <button
              key={String(s.id)}
              type="button"
              aria-label={`슬라이드 ${i + 1}`}
              onClick={() => setIdx(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === idx ? "w-8 bg-gradient-to-r from-cyan-400 to-amber-400/90" : "w-1.5 bg-white/20 hover:bg-white/35"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
