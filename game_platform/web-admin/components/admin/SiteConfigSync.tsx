"use client";

import { useEffect } from "react";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore, type SiteConfigState } from "@/store/useAuthStore";

function isSiteConfig(x: unknown): x is SiteConfigState {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.site_id === "string" &&
    typeof o.site_name === "string" &&
    typeof o.is_casino_enabled === "boolean" &&
    typeof o.is_powerball_enabled === "boolean" &&
    typeof o.is_toto_enabled === "boolean"
  );
}

export function SiteConfigSync() {
  const token = useAuthStore((s) => s.token);
  const setSite = useAuthStore((s) => s.setSite);

  useEffect(() => {
    if (!token) return;
    const base = publicApiBase();
    if (!base) return;

    let cancelled = false;
    fetch(`${base}/admin/site-config`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (cancelled || !isSiteConfig(data)) return;
        setSite(data);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [token, setSite]);

  return null;
}
