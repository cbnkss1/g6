import { create } from "zustand";

export type FlashTone = "none" | "up" | "down";

type Payload = Record<string, string | number | undefined | null>;

type State = {
  /** 금일 총 배팅 볼륨 (타이·취소·적특 포함) */
  totalBetTarget: number;
  /** 금일 유효 배팅 (승·패만, 롤링·정산 기준) */
  validBetTarget: number;
  rollingTarget: number;
  wsCount: number;
  betFlash: FlashTone;
  rollingFlash: FlashTone;
  hydrateFromApi: (d: Payload) => void;
  applyWsPayload: (p: Payload) => void;
};

let flashTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleClearFlash(set: (p: Partial<State>) => void) {
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    set({ betFlash: "none", rollingFlash: "none" });
    flashTimer = null;
  }, 650);
}

function readTotalBet(d: Payload): number {
  const v =
    d.today_total_bet ?? d.today_bet_total ?? 0;
  return Number.parseFloat(String(v)) || 0;
}

function readValidBet(d: Payload): number {
  const v = d.today_valid_bet ?? 0;
  return Number.parseFloat(String(v)) || 0;
}

export const useDashboardLiveStore = create<State>((set, get) => ({
  totalBetTarget: 0,
  validBetTarget: 0,
  rollingTarget: 0,
  wsCount: 0,
  betFlash: "none",
  rollingFlash: "none",

  hydrateFromApi: (d) => {
    set({
      totalBetTarget: readTotalBet(d),
      validBetTarget: readValidBet(d),
      rollingTarget: Number.parseFloat(String(d.today_rolling_total ?? 0)) || 0,
      wsCount: Number(d.admin_ws_connections ?? 0),
    });
  },

  applyWsPayload: (p) => {
    const prev = get();
    const hasTotal =
      p.today_total_bet !== undefined ||
      p.today_bet_total !== undefined;
    const hasValid = p.today_valid_bet !== undefined;
    const total = hasTotal ? readTotalBet(p) : prev.totalBetTarget;
    const valid = hasValid ? readValidBet(p) : prev.validBetTarget;
    const roll =
      p.today_rolling_total !== undefined
        ? Number.parseFloat(String(p.today_rolling_total)) || 0
        : prev.rollingTarget;
    const res = String(p.game_result ?? "");
    const hasResult = res.length > 0;
    const rollDelta =
      Number.parseFloat(String(p.rolling_credited_to_referrer ?? 0)) || 0;

    const betFlash: FlashTone = !hasResult
      ? "none"
      : res === "WIN"
        ? "up"
        : res === "LOSE"
          ? "down"
          : "none";
    const rollingFlash: FlashTone = rollDelta > 0 ? "up" : "none";

    set({
      totalBetTarget: total,
      validBetTarget: valid,
      rollingTarget: roll,
      wsCount:
        p.admin_ws_connections !== undefined
          ? Number(p.admin_ws_connections)
          : prev.wsCount,
      betFlash,
      rollingFlash,
    });
    scheduleClearFlash(set);
  },
}));
