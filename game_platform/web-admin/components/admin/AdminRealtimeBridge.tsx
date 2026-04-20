"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAdminDashboardSocket, type WsMsg } from "@/hooks/useAdminDashboardSocket";

/**
 * 단일 WebSocket으로 대시보드 집계 + 배팅 로그 + 입출금·문의 알림 등 React Query 무효화.
 */
export function AdminRealtimeBridge() {
  const qc = useQueryClient();
  const onExtraMessage = useCallback(
    (msg: WsMsg) => {
      if (msg.type === "dashboard_refresh") {
        void qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
        return;
      }
      if (
        msg.type === "cash_request_new" ||
        msg.type === "cash_request_updated" ||
        msg.type === "cash_request_approved"
      ) {
        void qc.invalidateQueries({ queryKey: ["cash-requests"] });
      }
      if (msg.type === "support_ticket_new") {
        void qc.invalidateQueries({ queryKey: ["admin", "support-tickets"] });
        void qc.invalidateQueries({ queryKey: ["admin", "support-ticket"] });
      }
      if (msg.type === "cash_request_new" || msg.type === "support_ticket_new") {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("admin-ops-notify", { detail: msg }));
        }
      }
      if (
        msg.type === "bet_log" ||
        msg.type === "settlement" ||
        msg.type === "dashboard_tick"
      ) {
        if (typeof window !== "undefined" && (msg.type === "bet_log" || msg.type === "settlement")) {
          window.dispatchEvent(new CustomEvent("admin-live-pulse", { detail: { type: msg.type } }));
        }
        void qc.invalidateQueries({ queryKey: ["admin", "bets"] });
        void qc.invalidateQueries({ queryKey: ["admin", "settlements"] });
        void qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      }
    },
    [qc],
  );
  useAdminDashboardSocket({ onExtraMessage });
  return null;
}
