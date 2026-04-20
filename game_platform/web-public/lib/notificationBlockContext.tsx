"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { playerNotificationBlockStatus } from "@/lib/playerApi";
import { usePlayerAuth } from "@/lib/playerAuthContext";

export type NotificationBlockContextValue = {
  blocked: boolean;
  unreadImportantCount: number;
  refresh: () => Promise<void>;
};

const NotificationBlockContext = createContext<NotificationBlockContextValue | null>(null);

export function NotificationBlockProvider({ children }: { children: ReactNode }) {
  const { token, hydrated } = usePlayerAuth();
  const [blocked, setBlocked] = useState(false);
  const [unreadImportantCount, setUnreadImportantCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!token) {
      setBlocked(false);
      setUnreadImportantCount(0);
      return;
    }
    try {
      const d = await playerNotificationBlockStatus(token);
      setBlocked(Boolean(d.blocked));
      setUnreadImportantCount(Number(d.unread_important_count ?? 0));
    } catch {
      setBlocked(false);
      setUnreadImportantCount(0);
    }
  }, [token]);

  useEffect(() => {
    if (!hydrated || !token) return;
    void refresh();
  }, [hydrated, token, refresh]);

  useEffect(() => {
    const onRefresh = () => void refresh();
    window.addEventListener("player-inbox-refresh", onRefresh);
    window.addEventListener("player-notification-block-refresh", onRefresh);
    const id = window.setInterval(() => void refresh(), 25_000);
    return () => {
      window.removeEventListener("player-inbox-refresh", onRefresh);
      window.removeEventListener("player-notification-block-refresh", onRefresh);
      window.clearInterval(id);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ blocked, unreadImportantCount, refresh }),
    [blocked, unreadImportantCount, refresh],
  );

  return (
    <NotificationBlockContext.Provider value={value}>{children}</NotificationBlockContext.Provider>
  );
}

export function useNotificationBlock(): NotificationBlockContextValue {
  const v = useContext(NotificationBlockContext);
  return v ?? { blocked: false, unreadImportantCount: 0, refresh: async () => {} };
}
