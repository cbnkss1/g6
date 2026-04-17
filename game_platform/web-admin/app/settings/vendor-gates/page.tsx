"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { CASINO_PROVIDERS, SLOT_PROVIDERS } from "@/lib/gameProviderCatalog";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type Flags = Record<string, boolean>;

function readFlags(raw: unknown): Flags {
  if (!raw || typeof raw !== "object") return {};
  const o: Flags = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    o[k] = Boolean(v);
  }
  return o;
}

export default function GameProvidersPage() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role ?? "");
  const base = publicApiBase();
  const headers = { Authorization: `Bearer ${token}` };
  const qc = useQueryClient();
  const canPatch = role === "super_admin" || role === "owner";
  const isSuper = role === "super_admin";
  const [siteId, setSiteId] = useState("");
  const [casino, setCasino] = useState<Flags>({});
  const [slot, setSlot] = useState<Flags>({});

  const q = useQuery({
    queryKey: ["admin", "site-policies", token ?? "", siteId, "gp"],
    queryFn: async () => {
      if (!base || !token) throw new Error("no token");
      const p = new URLSearchParams();
      if (isSuper && siteId.trim()) p.set("site_id", siteId.trim());
      const r = await adminFetch(`${base}/admin/site/policies?${p}`, { headers, cache: "no-store" });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as { site_id: string; policies: Record<string, unknown> };
    },
    enabled: Boolean(token),
    retry: 0,
  });

  useEffect(() => {
    const gp = (q.data?.policies as Record<string, unknown> | undefined)?.game_providers as
      | Record<string, unknown>
      | undefined;
    if (!gp || typeof gp !== "object") {
      setCasino({});
      setSlot({});
      return;
    }
    setCasino(readFlags(gp.casino));
    setSlot(readFlags(gp.slot));
  }, [q.data?.policies]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!base || !token) throw new Error("no token");
      const p = new URLSearchParams();
      if (isSuper && siteId.trim()) p.set("site_id", siteId.trim());
      const policies = {
        game_providers: {
          casino: casino,
          slot: slot,
        },
      };
      const r = await adminFetch(`${base}/admin/site/policies?${p}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ policies }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "site-policies"] });
    },
  });

  const toggle = (cat: "casino" | "slot", key: string) => {
    const set = cat === "casino" ? setCasino : setSlot;
    set((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <p className="text-premium-label">설정</p>
        <h1
          className="mt-1 text-2xl font-semibold text-slate-100"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          게임사 제한
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          <code className="text-slate-600">site_policies.game_providers</code> 에 ON/OFF 저장합니다. 플레이어 웹(
          <code className="text-slate-600">web-public</code> 라이브카지노·슬롯)과{" "}
          <code className="text-slate-600">POST /api/player/games/casino/launch</code> 에서 동일 플래그로 목록 숨김·
          실행 차단합니다.
        </p>
      </div>

      {isSuper ? (
        <label className="block max-w-md text-xs text-slate-500">
          site_id (슈퍼만, 비우면 기본)
          <input
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 font-mono text-sm text-slate-200"
            placeholder="UUID"
          />
        </label>
      ) : null}

      {q.isError ? <p className="text-sm text-red-400">{(q.error as Error).message}</p> : null}
      {q.isPending && q.isFetching ? (
        <p className="text-sm text-slate-500">불러오는 중… (최대 약 20초)</p>
      ) : null}

      {q.data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="glass-card-sm p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-200">카지노</h2>
            <ul className="space-y-2 text-sm text-slate-300">
              {CASINO_PROVIDERS.map(({ key, label }) => (
                <li key={key} className="flex items-center justify-between gap-2 border-b border-slate-800/60 py-2">
                  <span>{label}</span>
                  <button
                    type="button"
                    disabled={!canPatch}
                    onClick={() => toggle("casino", key)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      casino[key] ? "bg-amber-500/90 text-slate-950" : "bg-slate-800 text-slate-500"
                    }`}
                  >
                    {casino[key] ? "ON" : "OFF"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="glass-card-sm p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-200">슬롯</h2>
            <ul className="space-y-2 text-sm text-slate-300">
              {SLOT_PROVIDERS.map(({ key, label }) => (
                <li key={key} className="flex items-center justify-between gap-2 border-b border-slate-800/60 py-2">
                  <span>{label}</span>
                  <button
                    type="button"
                    disabled={!canPatch}
                    onClick={() => toggle("slot", key)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      slot[key] ? "bg-amber-500/90 text-slate-950" : "bg-slate-800 text-slate-500"
                    }`}
                  >
                    {slot[key] ? "ON" : "OFF"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {canPatch && q.data ? (
        <button
          type="button"
          disabled={mut.isPending}
          onClick={() => mut.mutate()}
          className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-600 px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {mut.isPending ? "저장 중…" : "게임사 설정 저장"}
        </button>
      ) : null}
      {mut.isError ? <p className="text-xs text-red-400">{(mut.error as Error).message}</p> : null}
    </div>
  );
}
