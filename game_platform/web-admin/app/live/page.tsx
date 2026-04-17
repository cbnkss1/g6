"use client";

import { useEffect, useRef, useState } from "react";
import { publicAdminWsUrl } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

export default function LivePage() {
  const [lines, setLines] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const jwt = useAuthStore((s) => s.token);

  useEffect(() => {
    const base = publicAdminWsUrl();
    if (!jwt) return;

    const url = `${base}?token=${encodeURIComponent(jwt)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      setLines((prev) => [String(ev.data), ...prev].slice(0, 50));
    };
    return () => ws.close();
  }, [jwt]);

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-100">실시간 스트림</h2>
      <p className="mt-2 text-sm text-slate-400">
        <code className="text-premium">publicAdminWsUrl()</code> /{" "}
        <code className="text-premium">NEXT_PUBLIC_WS_URL</code> + JWT
      </p>
      <pre className="mt-4 max-h-96 overflow-auto rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-slate-300">
        {lines.length ? lines.join("\n\n") : "수신 대기…"}
      </pre>
    </div>
  );
}
