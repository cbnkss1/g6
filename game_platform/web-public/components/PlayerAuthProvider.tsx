"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { PlayerAuthModals } from "@/components/PlayerAuthModals";
import {
  PlayerAuthContext,
  type AuthMode,
  type PlayerAuthContextValue,
} from "@/lib/playerAuthContext";
import { type LoginResponse, type UserPublic, playerMe, playerPresencePing } from "@/lib/playerApi";

const STORAGE_KEY = "gp_player_jwt";

export function PlayerAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserPublic | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("closed");

  const applySession = useCallback((res: LoginResponse) => {
    setToken(res.access_token);
    setUser(res.user);
    localStorage.setItem(STORAGE_KEY, res.access_token);
  }, []);

  const refreshProfile = useCallback(async () => {
    const t = token ?? (typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null);
    if (!t) return;
    const d = await playerMe(t);
    setUser(d.user);
  }, [token]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("openLogin") === "1" || sp.get("login") === "1") {
        setAuthMode("login");
        sp.delete("openLogin");
        sp.delete("login");
        const q = sp.toString();
        const path = window.location.pathname + (q ? `?${q}` : "") + window.location.hash;
        window.history.replaceState({}, "", path);
      }
    }
  }, []);

  useEffect(() => {
    const t = localStorage.getItem(STORAGE_KEY);
    if (!t) {
      setHydrated(true);
      return;
    }
    // JWT 만료 여부 빠른 체크 (서버 호출 전)
    try {
      const payload = JSON.parse(atob(t.split(".")[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem(STORAGE_KEY);
        setHydrated(true);
        return;
      }
    } catch {}
    setToken(t);
    const ac = new AbortController();
    const to = window.setTimeout(() => ac.abort(), 10_000);
    playerMe(t, { signal: ac.signal })
      .then((d) => setUser(d.user))
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        window.clearTimeout(to);
        setHydrated(true);
      });
  }, []);

  useEffect(() => {
    if (!token) return;
    const tick = () => {
      playerPresencePing(token).catch(() => {});
    };
    tick();
    const id = window.setInterval(tick, 40_000);
    return () => window.clearInterval(id);
  }, [token]);

  const value = useMemo<PlayerAuthContextValue>(
    () => ({
      token,
      user,
      hydrated,
      authMode,
      openLogin: () => setAuthMode("login"),
      openRegister: () => setAuthMode("register"),
      closeAuth: () => setAuthMode("closed"),
      logout,
      applySession,
      refreshProfile,
    }),
    [token, user, hydrated, authMode, logout, applySession, refreshProfile],
  );

  return (
    <PlayerAuthContext.Provider value={value}>
      {children}
      <PlayerAuthModals />
    </PlayerAuthContext.Provider>
  );
}
