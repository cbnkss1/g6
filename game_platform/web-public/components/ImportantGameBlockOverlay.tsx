"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useNotificationBlock } from "@/lib/notificationBlockContext";
import { usePlayerAuth } from "@/lib/playerAuthContext";

const GAME_PREFIXES = ["/casino", "/slot", "/powerball", "/match-list"];

function isGamePath(path: string): boolean {
  return GAME_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));
}

/**
 * 중요 쪽지를 아직 읽지 않은 경우 스포츠·카지노·슬롯·미니게임 라우트에 진입 차단.
 */
export function ImportantGameBlockOverlay() {
  const pathname = usePathname();
  const { user, token, hydrated } = usePlayerAuth();
  const { blocked } = useNotificationBlock();

  if (!hydrated || !user || !token) return null;
  if (!blocked || !isGamePath(pathname)) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0a0a0f]/88 px-4 backdrop-blur-md">
      <div className="relative max-w-md overflow-hidden rounded-2xl border border-amber-500/35 bg-gradient-to-b from-slate-900/98 to-slate-950/98 p-6 text-center shadow-[0_0_80px_rgba(245,158,11,0.12)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-400/95">Important notice</p>
        <h2 className="mt-2 font-display text-xl font-semibold text-white">중요 쪽지를 먼저 확인해 주세요</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          운영자가 보낸 <span className="font-medium text-amber-200/95">중요 쪽지</span>를 열람해야 스포츠·카지노·슬롯·미니게임을
          이용할 수 있습니다. 쪽지함에서 제목을 눌러 내용을 확인해 주세요.
        </p>
        <Link
          href="/messages"
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 via-amber-500 to-rose-600 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_12px_40px_rgba(245,158,11,0.25)] transition hover:brightness-105"
        >
          쪽지함으로 이동
        </Link>
        <p className="mt-3 text-[11px] text-slate-600">확인 후 자동으로 게임 화면을 이용할 수 있습니다.</p>
      </div>
    </div>
  );
}
