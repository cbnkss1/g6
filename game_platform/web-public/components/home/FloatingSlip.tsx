"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useBetSlip } from "./BetSlipContext";

function productOdds(lines: { odds: number }[]): number {
  if (lines.length === 0) return 0;
  return lines.reduce((acc, x) => acc * x.odds, 1);
}

export function FloatingSlip() {
  const { lines, removeLine, clear } = useBetSlip();
  const [open, setOpen] = useState(false);
  const [stake, setStake] = useState("10000");

  const stakeNum = useMemo(() => {
    const n = Number(String(stake).replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [stake]);

  const combined = useMemo(() => productOdds(lines), [lines]);
  const potential = useMemo(() => Math.floor(stakeNum * combined), [stakeNum, combined]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-10 right-4 z-[45] flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/35 bg-gradient-to-br from-cyan-500/25 to-[#121212] text-cyan-100 shadow-[0_8px_32px_rgba(34,211,238,0.25),inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-amber-400/40 hover:shadow-[0_0_28px_rgba(212,175,55,0.2)] sm:bottom-11 sm:right-6"
        aria-label="베팅 슬립"
      >
        <span className="relative text-xl font-bold">🎫</span>
        {lines.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-[#121212]">
            {lines.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="닫기"
              className="fixed inset-0 z-[48] bg-black/50 backdrop-blur-[2px] sm:bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              className="fixed bottom-0 right-0 top-[60px] z-[50] flex w-full max-w-md flex-col border-l border-white/[0.08] bg-[#141414]/98 shadow-[-12px_0_48px_rgba(0,0,0,0.6)] backdrop-blur-xl"
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80">Bet Slip</p>
                  <p className="font-display text-lg text-white">마이 베팅 슬립</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5"
                >
                  닫기
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {lines.length === 0 ? (
                  <p className="py-12 text-center text-sm text-slate-500">
                    배당판에서 홈·무·원정 배당을 눌러 담아 보세요.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {lines.map((l) => (
                      <li
                        key={l.id}
                        className="flex items-start justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-[11px] leading-snug text-slate-300">{l.label}</p>
                          <p className="mt-1 font-mono text-sm text-cyan-300/90">@{l.odds.toFixed(2)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(l.id)}
                          className="shrink-0 text-xs text-slate-500 hover:text-red-400"
                        >
                          삭제
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-white/[0.06] bg-black/30 px-4 py-4">
                <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">가상 스테이크 (원)</label>
                <input
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-slate-200 outline-none focus:border-cyan-400/40"
                  inputMode="numeric"
                />
                <div className="mt-3 flex justify-between text-xs text-slate-400">
                  <span>복식 배당 (데모)</span>
                  <span className="font-mono text-cyan-200/90">{combined > 0 ? combined.toFixed(3) : "—"}</span>
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-slate-400">예상 적중액</span>
                  <span className="font-mono font-semibold text-amber-300/95">
                    {lines.length ? potential.toLocaleString("ko-KR") : "0"} 원
                  </span>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
                  실제 베팅은 스포츠·파워볼 각 메뉴의 규정을 따릅니다. 여기는 메인 화면 데모 합산입니다.
                </p>
                {lines.length > 0 && (
                  <button
                    type="button"
                    onClick={() => clear()}
                    className="mt-3 w-full rounded-lg border border-white/10 py-2 text-xs text-slate-400 hover:bg-white/5"
                  >
                    슬립 비우기
                  </button>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
