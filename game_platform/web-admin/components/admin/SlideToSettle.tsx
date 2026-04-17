"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface Particle { id: number; x: number; y: number; tx: string; ty: string; color: string; }

interface Props {
  label?: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
}

const COLORS = ["#d4af37","#f0e2a8","#ffffff","#fbbf24","#86efac","#d4af37"];

function spawnParticles(count = 20): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    tx: `${(Math.random() - 0.5) * 120}px`,
    ty: `${-Math.random() * 80 - 20}px`,
    color: COLORS[i % COLORS.length],
  }));
}

export function SlideToSettle({ label = "밀어서 한방 정산", onConfirm, disabled, loading }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const startX = useRef(0);
  const THUMB = 52;

  const trackWidth = useCallback(() => (trackRef.current?.clientWidth ?? 300) - THUMB, []);

  function onPointerDown(e: React.PointerEvent) {
    if (disabled || loading || done) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startX.current = e.clientX - offset;
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    setOffset(Math.max(0, Math.min(e.clientX - startX.current, trackWidth())));
  }

  async function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    const tw = trackWidth();
    if (offset / tw >= 0.85) {
      setDone(true);
      setOffset(tw);
      setParticles(spawnParticles(24));
      await onConfirm();
      setTimeout(() => { setDone(false); setOffset(0); setParticles([]); }, 2000);
    } else {
      setOffset(0);
    }
  }

  const progress = trackWidth() > 0 ? offset / trackWidth() : 0;

  return (
    <div className="relative">
      {/* 파티클 레이어 */}
      {particles.map(p => (
        <div
          key={p.id}
          className="pointer-events-none absolute z-10 h-2 w-2 animate-particle rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            background: p.color,
            boxShadow: `0 0 6px ${p.color}`,
            ["--tx" as string]: p.tx,
            ["--ty" as string]: p.ty,
          }}
        />
      ))}

      <div
        ref={trackRef}
        className={`relative h-16 select-none overflow-hidden rounded-2xl transition-all ${
          disabled || loading ? "opacity-50 cursor-not-allowed" : "cursor-grab active:cursor-grabbing"
        }`}
        style={{
          background: done
            ? "linear-gradient(135deg, rgba(16,185,129,0.2), rgba(5,150,105,0.1))"
            : "rgba(8,15,28,0.9)",
          border: done
            ? "1px solid rgba(52,211,153,0.4)"
            : "1px solid rgba(212,175,55,0.25)",
          boxShadow: done
            ? "0 0 32px rgba(52,211,153,0.3)"
            : "0 0 24px rgba(212,175,55,0.1), inset 0 1px 0 rgba(212,175,55,0.08)",
          touchAction: "none",
        }}
      >
        {/* 진행 채움 */}
        <div
          className="absolute inset-y-0 left-0 transition-all"
          style={{
            width: `${offset + THUMB}px`,
            background: done
              ? "linear-gradient(90deg, rgba(52,211,153,0.15), rgba(52,211,153,0.05))"
              : `linear-gradient(90deg, rgba(212,175,55,${progress * 0.15}), transparent)`,
          }}
        />

        {/* 안내 텍스트 */}
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center font-semibold tracking-wide transition-all"
          style={{
            opacity: done ? 0 : Math.max(0.2, 1 - progress * 2.5),
            color: "rgba(212,175,55,0.6)",
            fontSize: "13px",
            letterSpacing: "0.15em",
          }}
        >
          {loading ? "정산 중…" : label}
        </span>

        {done && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-emerald-300 tracking-widest">
            ✓ 한방 정산 완료
          </span>
        )}

        {/* 슬라이더 핸들 */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="absolute top-1.5 bottom-1.5 flex items-center justify-center rounded-xl"
          style={{
            left: offset,
            width: THUMB,
            transition: dragging ? "none" : "left 0.35s cubic-bezier(0.34,1.56,0.64,1)",
            background: done
              ? "linear-gradient(135deg, #10b981, #047857)"
              : dragging
              ? "linear-gradient(135deg, #f0e2a8, #d4af37)"
              : "linear-gradient(135deg, #d4af37 0%, #c49b2e 50%, #8a7530 100%)",
            boxShadow: done
              ? "0 0 24px rgba(52,211,153,0.6)"
              : dragging
              ? "0 0 32px rgba(212,175,55,0.8), 0 4px 16px rgba(0,0,0,0.5)"
              : "0 0 20px rgba(212,175,55,0.4), 0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
          }}
        >
          <span className={`text-xl select-none ${done ? "text-white" : "text-slate-950"}`}>
            {done ? "✓" : loading ? "⟳" : "▶"}
          </span>
        </div>
      </div>
    </div>
  );
}
