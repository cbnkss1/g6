"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type BetSlipLine = {
  id: string;
  matchId: number;
  label: string;
  odds: number;
};

type Ctx = {
  lines: BetSlipLine[];
  addLine: (line: BetSlipLine) => boolean;
  removeLine: (id: string) => void;
  clear: () => void;
};

const BetSlipContext = createContext<Ctx | null>(null);

export function BetSlipProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<BetSlipLine[]>([]);

  const addLine = useCallback((line: BetSlipLine) => {
    let ok = false;
    setLines((prev) => {
      if (prev.some((p) => p.id === line.id)) return prev;
      ok = true;
      return [...prev, line];
    });
    return ok;
  }, []);

  const removeLine = useCallback((id: string) => {
    setLines((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(
    () => ({ lines, addLine, removeLine, clear }),
    [lines, addLine, removeLine, clear],
  );

  return <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>;
}

export function useBetSlip() {
  const v = useContext(BetSlipContext);
  if (!v) throw new Error("useBetSlip must be used within BetSlipProvider");
  return v;
}
