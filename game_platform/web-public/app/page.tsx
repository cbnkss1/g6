"use client";

import { BetSlipProvider } from "@/components/home/BetSlipContext";
import { CentralNav } from "@/components/home/CentralNav";
import { FloatingSlip } from "@/components/home/FloatingSlip";
import { Header } from "@/components/home/Header";
import { HeroBanner } from "@/components/home/HeroBanner";
import { LiveBoard } from "@/components/home/LiveBoard";
import { WinTicker } from "@/components/home/WinTicker";

export default function HomePage() {
  return (
    <BetSlipProvider>
      <div className="min-h-screen bg-[#121212] pb-28 text-slate-200">
        <Header />
        <main className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6">
          <HeroBanner />
          <CentralNav />
          <LiveBoard />
        </main>
        <footer className="mx-auto max-w-[1800px] px-4 py-6 pb-24 text-center text-[11px] text-slate-600 sm:px-6">
          <span className="text-cyan-500/60">© SLOTPASS</span>
          <span className="mx-2 text-slate-700">·</span>
          <span className="text-amber-500/50">Elite Player</span>
        </footer>
        <WinTicker />
        <FloatingSlip />
      </div>
    </BetSlipProvider>
  );
}
