"use client";

import { createContext, useContext } from "react";

import type { LoginResponse, UserPublic } from "@/lib/playerApi";

export type AuthMode = "closed" | "login" | "register";

export type PlayerAuthContextValue = {
  token: string | null;
  user: UserPublic | null;
  hydrated: boolean;
  authMode: AuthMode;
  openLogin: () => void;
  openRegister: () => void;
  closeAuth: () => void;
  logout: () => void;
  applySession: (res: LoginResponse) => void;
  /** /api/player/me 재조회 후 user 갱신 (입출금 신청 후 잔고 등). */
  refreshProfile: () => Promise<void>;
};

export const PlayerAuthContext = createContext<PlayerAuthContextValue | null>(null);

export function usePlayerAuth(): PlayerAuthContextValue {
  const c = useContext(PlayerAuthContext);
  if (!c) throw new Error("usePlayerAuth must be used within PlayerAuthProvider");
  return c;
}

/** 타입만 필요할 때 (서버 컴포넌트 등) */
export type { UserPublic, LoginResponse };
