"use client";

import { useEffect } from "react";
import { publicAdminWsUrl } from "@/lib/publicApiBase";
import { useDashboardLiveStore } from "@/store/useDashboardLiveStore";
import { useAuthStore } from "@/store/useAuthStore";

type WsMsg = {
  type?: string;
  payload?: Record<string, string | number | string[] | undefined | null>;
};

export type AdminWsExtraHandler = (msg: WsMsg) => void;

export function useAdminDashboardSocket(opts?: { onExtraMessage?: AdminWsExtraHandler }) {
  const applyWsPayload = useDashboardLiveStore((s) => s.applyWsPayload);
  const token = useAuthStore((s) => s.token);
  const onExtra = opts?.onExtraMessage;

  useEffect(() => {
    const url = publicAdminWsUrl();
    if (!token) return;

    let ws: WebSocket | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      const u = `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
      ws = new WebSocket(u);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as WsMsg;
          onExtra?.(msg);
          if (
            (msg.type === "settlement" || msg.type === "dashboard_tick") &&
            msg.payload
          ) {
            applyWsPayload(msg.payload as Record<string, string | number>);
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (!closed) setTimeout(connect, 2000);
      };
    };

    connect();
    return () => {
      closed = true;
      ws?.close();
    };
  }, [applyWsPayload, token, onExtra]);
}
