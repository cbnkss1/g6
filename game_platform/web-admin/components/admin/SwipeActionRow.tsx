"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  onDetail?: () => void;
  onSanction?: () => void;
  detailLabel?: string;
  sanctionLabel?: string;
};

/**
 * 모바일: 좌→우 스와이프 시 액션 노출 (오클릭 방지용 큰 버튼).
 */
export function SwipeActionRow({
  children,
  onDetail,
  onSanction,
  detailLabel = "상세정보",
  sanctionLabel = "제재",
}: Props) {
  const [open, setOpen] = useState(false);
  const startX = useRef(0);
  const dx = useRef(0);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    dx.current = 0;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    dx.current = e.touches[0].clientX - startX.current;
  }, []);

  const onTouchEnd = useCallback(() => {
    if (dx.current < -56) setOpen(true);
    else if (dx.current > 40) setOpen(false);
    dx.current = 0;
  }, []);

  return (
    <div
      className={`swipe-row rounded-xl ${open ? "swiped" : ""}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="swipe-content relative z-[1] bg-slate-950/90">{children}</div>
      <div className="swipe-actions z-0">
        <button
          type="button"
          className="admin-touch-btn flex min-w-[72px] items-center justify-center bg-slate-800 px-2 text-xs font-semibold text-slate-200"
          onClick={() => {
            setOpen(false);
            onDetail?.();
          }}
        >
          {detailLabel}
        </button>
        <button
          type="button"
          className="admin-touch-btn flex min-w-[72px] items-center justify-center bg-red-900/80 px-2 text-xs font-semibold text-red-100"
          onClick={() => {
            setOpen(false);
            onSanction?.();
          }}
        >
          {sanctionLabel}
        </button>
      </div>
    </div>
  );
}
