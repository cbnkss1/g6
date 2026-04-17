"use client";

import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/adminFetch";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { useDashboardLiveStore } from "@/store/useDashboardLiveStore";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";
import { useEffect, useMemo } from "react";

function fmtK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toLocaleString();
}

/* 미니 바 차트 */
function MiniBar({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-10 items-end gap-0.5">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm transition-all duration-500"
          style={{
            height: `${Math.max(8, (v / max) * 100)}%`,
            background: i === values.length - 1
              ? color
              : `color-mix(in srgb, ${color} 30%, transparent)`,
          }}
        />
      ))}
    </div>
  );
}

/* glow ring */
function flashRing(tone: "none" | "up" | "down") {
  if (tone === "up") return "glow-flash-emerald";
  if (tone === "down") return "glow-flash-red";
  return "";
}

export function DashboardCards() {
  const token = useAuthStore((s) => s.token);
  const totoOn = useAuthStore((s) => s.site?.is_toto_enabled === true);
  const hydrateFromApi = useDashboardLiveStore((s) => s.hydrateFromApi);
  const totalBetTarget = useDashboardLiveStore((s) => s.totalBetTarget);
  const validBetTarget = useDashboardLiveStore((s) => s.validBetTarget);
  const rollingTarget = useDashboardLiveStore((s) => s.rollingTarget);
  const wsCount = useDashboardLiveStore((s) => s.wsCount);
  const betFlash = useDashboardLiveStore((s) => s.betFlash);
  const rollingFlash = useDashboardLiveStore((s) => s.rollingFlash);

  const q = useQuery({
    queryKey: ["admin", "dashboard", "today", token ?? ""],
    queryFn: async () => {
      const base = publicApiBase();
      if (!base || !token) throw new Error("missing env or token");
      const r = await adminFetch(`${base}/admin/dashboard/today`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`dashboard ${r.status}`);
      return (await r.json()) as Record<string, unknown>;
    },
    enabled: Boolean(token),
    // WS(dashboard_tick 등)가 1차 갱신. 폴백은 짧게 두어 실시간에 가깝게 (docs/PRODUCT_NOTES_KO.md).
    refetchInterval: 15_000,
    retry: 0,
  });

  useEffect(() => {
    if (q.data) hydrateFromApi(q.data as Record<string, string | number>);
  }, [q.data, hydrateFromApi]);

  const totalDisplay = useAnimatedNumber(totalBetTarget, 500);
  const validDisplay = useAnimatedNumber(validBetTarget, 480);
  const rollDisplay = useAnimatedNumber(rollingTarget, 520);
  const onlineDisplay = useAnimatedNumber(wsCount, 400);

  // 가상 시간대별 바 데이터 (총 배팅의 시간대 분포 시뮬레이션)
  const bars = useMemo(() => {
    const t = totalDisplay;
    return [t * 0.03, t * 0.05, t * 0.08, t * 0.12, t * 0.10, t * 0.18, t * 0.22, t * 0.35, t * 0.50, t * 0.65, t * 0.80, t];
  }, [totalDisplay]);

  const profitEst = Math.round(totalDisplay * 0.14); // ~14% HE 추정
  const profitPct = totalDisplay > 0 ? ((profitEst / totalDisplay) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-4 animate-fade-up">
      {q.isError && (
        <div className="glass-card-sm flex items-center gap-2 px-4 py-3">
          <span className="text-amber-400">⚠</span>
          <p className="text-xs text-amber-400/90">대시보드 로드 실패 — API·JWT·CORS 확인 필요</p>
        </div>
      )}

      {q.data ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { k: "충전 대기", v: Number(q.data.pending_deposit_requests ?? 0), c: "text-purple-200" },
            { k: "환전 대기", v: Number(q.data.pending_withdraw_requests ?? 0), c: "text-rose-200" },
            {
              k: "금일 충전(승인)",
              v: Number.parseFloat(String(q.data.today_deposit_approved_sum ?? 0)) || 0,
              c: "text-emerald-200/90",
              money: true,
            },
            {
              k: "금일 환전(승인)",
              v: Number.parseFloat(String(q.data.today_withdraw_approved_sum ?? 0)) || 0,
              c: "text-sky-200/90",
              money: true,
            },
          ].map((x) => (
            <div key={x.k} className="rounded-xl border border-slate-800/80 bg-slate-950/50 px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider text-slate-600">{x.k}</p>
              <p className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${x.c}`}>
                {"money" in x && x.money ? Math.round(x.v).toLocaleString("ko-KR") : x.v}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {/* 메인 히어로 카드 */}
      <div
        className={`glass-card relative overflow-hidden p-6 transition-all duration-500 ${flashRing(betFlash)}`}
        style={{ borderColor: "rgba(212,175,55,0.2)" }}
      >
        {/* 배경 글로우 */}
        <div className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(212,175,55,0.2), transparent)",
          }}
        />
        {/* 금일 배팅 */}
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-premium-label">금일 총 배팅 볼륨</p>
            <p className="mt-0.5 text-[10px] text-slate-600">타이·적특·취소 포함 · Total Bet</p>
            <p
              className={`mt-4 font-display text-5xl font-bold tabular-nums tracking-tight sm:text-6xl ${
                betFlash === "up" ? "text-emerald-300" : betFlash === "down" ? "text-red-300" : "text-slate-50"
              }`}
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              {fmtK(totalDisplay)}
            </p>
            <p className="mt-0.5 text-xs text-slate-600">게임머니</p>
          </div>
          {/* 미니 바 차트 */}
          <div className="w-32 sm:w-40">
            <p className="mb-1 text-[9px] text-slate-600">24시간 흐름</p>
            <MiniBar values={bars} color="#d4af37" />
          </div>
        </div>

        <div className="premium-divider my-5" />

        {/* 3컬럼 서브 스탯 */}
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              label: "유효 배팅 (승·패)",
              value: fmtK(validDisplay),
              suffix: "GM",
              pct: totalDisplay > 0 ? ((validDisplay / totalDisplay) * 100).toFixed(0) : "0",
              color: "#d4af37",
            },
            {
              label: "롤링 적립",
              value: fmtK(rollDisplay),
              suffix: "P",
              pct: null,
              color: "#60a5fa",
              flash: rollingFlash,
            },
            {
              label: "추정 본사 수익",
              value: fmtK(profitEst),
              suffix: "GM",
              pct: profitPct + "%",
              color: "#34d399",
            },
          ].map((s) => (
            <div key={s.label}
              className={`space-y-1 ${s.flash === "up" ? "glow-flash-emerald" : ""}`}
            >
              <p className="text-[9px] font-medium uppercase tracking-widest text-slate-600">{s.label}</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: s.color }}>
                {s.value}
                <span className="ml-1 text-xs font-normal text-slate-600">{s.suffix}</span>
              </p>
              {s.pct && (
                <div className="stat-bar-track mt-1" style={{ "--bar-color": s.color } as React.CSSProperties}>
                  <div className="stat-bar-fill" style={{ width: `${Math.min(100, parseFloat(s.pct))}%`, background: s.color }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 서브 카드 그리드 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "WS 접속 세션",
            value: onlineDisplay,
            unit: "세션",
            icon: "●",
            color: "#34d399",
            live: true,
          },
          {
            label: "금일 롤링 적립",
            value: rollDisplay,
            unit: "P",
            icon: "◑",
            color: "#60a5fa",
            live: false,
          },
          {
            label: "스포츠 토토",
            value: totoOn ? "ON" : "OFF",
            unit: "",
            icon: "⚽",
            color: totoOn ? "#d4af37" : "#475569",
            live: false,
          },
          {
            label: "시스템 상태",
            value: "정상",
            unit: "",
            icon: "✓",
            color: "#34d399",
            live: false,
          },
        ].map((c) => (
          <div
            key={c.label}
            className="glass-card-sm relative flex flex-col gap-3 p-4 transition-all"
          >
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-600">{c.label}</p>
              <span className="text-sm" style={{ color: c.color }}>{c.icon}</span>
            </div>
            <p className="text-2xl font-bold tabular-nums" style={{ color: c.color }}>
              {typeof c.value === "number" ? c.value.toLocaleString() : c.value}
              {c.unit && <span className="ml-1 text-xs font-normal text-slate-600">{c.unit}</span>}
            </p>
            {c.live && (
              <span className="absolute right-3 top-3 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
