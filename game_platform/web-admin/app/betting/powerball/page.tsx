"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type Overview = {
  next_round: number;
  min_bet: string;
  default_odds_env: number;
  odds_by_pick: Record<string, string>;
  game_key: string;
  poll_mode?: {
    background_interval_sec: number;
    powerball_enabled: boolean;
    max_attempts_per_tick?: number;
  };
  recovery?: {
    pending_without_round: Array<{
      game_key: string;
      round_no: number;
      pending_bet_count: number;
    }>;
    note?: string;
  };
  recent_rounds: Array<{
    round_no: number;
    num: number | null;
    pb: number | null;
    sum: number | null;
    created_at: string | null;
  }>;
  valid_picks: string[];
};

type BetRow = {
  id: number;
  user_id: number;
  login_id: string;
  round_no: number;
  pick: string;
  amount: string;
  odds: string;
  status: string;
  payout: string | null;
  created_at: string | null;
  settled_at: string | null;
};

export default function PowerballAdminPage() {
  const token = useAuthStore((s) => s.token);
  const myUser = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [userId, setUserId] = useState(String(myUser?.id ?? ""));
  const [pick, setPick] = useState("pb_odd");
  const [amount, setAmount] = useState("1000");
  const [msg, setMsg] = useState<string | null>(null);
  const [oddsDraft, setOddsDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (myUser?.id && userId === "") setUserId(String(myUser.id));
  }, [myUser?.id, userId]);

  const oddsSynced = useRef(false);
  useEffect(() => {
    oddsSynced.current = false;
  }, [token]);

  const ov = useQuery({
    queryKey: ["admin", "powerball", "overview", token ?? ""],
    queryFn: async () => {
      const base = publicApiBase();
      if (!base || !token) throw new Error("no token");
      const r = await fetch(`${base}/admin/powerball/overview`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`overview ${r.status}`);
      return (await r.json()) as Overview;
    },
    enabled: Boolean(token),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const ob = ov.data?.odds_by_pick;
    if (!ob || oddsSynced.current) return;
    setOddsDraft({ ...ob });
    oddsSynced.current = true;
  }, [ov.data?.odds_by_pick]);

  const betsQ = useQuery({
    queryKey: ["admin", "powerball", "bets", token ?? ""],
    queryFn: async () => {
      const base = publicApiBase();
      if (!base || !token) throw new Error("no token");
      const r = await fetch(`${base}/admin/powerball/bets?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`bets ${r.status}`);
      return (await r.json()) as { items: BetRow[] };
    },
    enabled: Boolean(token),
    refetchInterval: 15_000,
  });

  const pollMut = useMutation({
    mutationFn: async () => {
      const base = publicApiBase();
      if (!base || !token) throw new Error("no token");
      const r = await fetch(`${base}/admin/powerball/poll`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { detail?: string }).detail || `poll ${r.status}`);
      return j;
    },
    onSuccess: (j: unknown) => {
      const r = j as {
        ok?: boolean;
        committed?: boolean;
        repaired_settlements?: number;
        error?: string;
      };
      if (r.ok) setMsg("API 동기화 완료");
      else if (r.committed)
        setMsg(
          `상위 피드는 실패했지만 DB 변경은 반영됨(보정 ${String(r.repaired_settlements ?? 0)}건). ${r.error ?? ""}`.trim(),
        );
      else setMsg("API 동기화 완료");
      qc.invalidateQueries({ queryKey: ["admin", "powerball"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const betMut = useMutation({
    mutationFn: async () => {
      const base = publicApiBase();
      if (!base || !token) throw new Error("no token");
      const uid = Number(userId);
      if (!Number.isFinite(uid) || uid < 1) throw new Error("유효한 user_id를 입력하세요");
      const r = await fetch(`${base}/admin/powerball/bets`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: uid, pick, amount }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { detail?: string }).detail || `bet ${r.status}`);
      return j;
    },
    onSuccess: () => {
      setMsg("배팅 접수됨");
      qc.invalidateQueries({ queryKey: ["admin", "powerball"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const oddsSaveMut = useMutation({
    mutationFn: async () => {
      const base = publicApiBase();
      if (!base || !token) throw new Error("no token");
      const r = await fetch(`${base}/admin/powerball/odds`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ odds: oddsDraft }),
      });
      const j = (await r.json().catch(() => ({}))) as { detail?: string; odds?: Record<string, string> };
      if (!r.ok) throw new Error(j.detail || `odds ${r.status}`);
      return j;
    },
    onSuccess: (data) => {
      if (data.odds) setOddsDraft(data.odds);
      setMsg("배당 저장됨");
      qc.invalidateQueries({ queryKey: ["admin", "powerball"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const o = ov.data;

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <p className="text-premium-label">파워볼 · 코인파워볼</p>
        <h2
          className="mt-1 text-2xl font-semibold text-slate-100"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          회차 동기화 &amp; 시험 배팅
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          <code className="rounded bg-black/30 px-1">POST /admin/powerball/poll</code> 로 외부 API 1회 반영 후
          정산됩니다. 배팅은 게임머니에서 차감됩니다.
        </p>
        <div className="mt-3 rounded-xl border border-slate-700/80 bg-slate-950/60 px-3 py-3 text-[13px] leading-relaxed text-slate-300">
          <p className="font-semibold text-slate-200">왜 “API가 꺼진 것처럼” 보이나요?</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-slate-400">
            <li>
              서버는 기본적으로 <strong className="text-slate-300">상시 폴링을 하지 않습니다</strong>. 회차 수집·정산은
              이 버튼, 또는 cron으로 <code className="text-slate-300">POST /internal/powerball/poll</code> 을 돌릴
              때만 진행됩니다.
            </li>
            <li>
              <code className="text-slate-300">GAME_PLATFORM_POWERBALL_POLL_INTERVAL_SEC</code> 를 0보다 크게
              두면(예: 60) API 프로세스가 그 간격으로 자동 수집합니다.
            </li>
            <li>
              배팅이 계속 <strong className="text-slate-300">pending</strong>이면, 해당 회차 결과가 아직 DB에
              들어오지 않았거나(수집 중단)·외부 피드 URL 오류·<code className="text-slate-300">POWERBALL_ENABLED=false</code>
              입니다.
            </li>
            <li>
              우리 서버는 수집 실패 시 <strong className="text-slate-300">같은 주기 안에서 자동 재시도</strong>하고,
              결과는 있는데 정산이 빠진 회차는 poll 때마다 <strong className="text-slate-300">자동 보정</strong>합니다.
            </li>
          </ul>
          {o?.poll_mode != null && (
            <p className="mt-2 border-t border-slate-700/80 pt-2 text-slate-400">
              현재 서버: 자동 수집 간격{" "}
              <strong className="text-premium">
                {o.poll_mode.background_interval_sec > 0
                  ? `${o.poll_mode.background_interval_sec}초`
                  : "미사용(0)"}
              </strong>
              {o.poll_mode.powerball_enabled === false && (
                <span className="ml-2 text-red-400">· POWERBALL_ENABLED 꺼짐</span>
              )}
              {o.poll_mode.max_attempts_per_tick != null && (
                <span className="ml-2 text-slate-500">
                  · 틱당 재시도 {o.poll_mode.max_attempts_per_tick}회
                </span>
              )}
            </p>
          )}
          {o?.recovery != null && o.recovery.pending_without_round?.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-600/40 bg-amber-950/30 px-3 py-2 text-[12px] text-amber-100">
              <p className="font-semibold text-amber-200">
                결과 미수신 회차 (배팅만 pending · DB에 회차 행 없음) — {o.recovery.pending_without_round.length}건
              </p>
              <ul className="mt-1 max-h-32 list-inside list-disc overflow-y-auto text-amber-100/90">
                {o.recovery.pending_without_round.slice(0, 20).map((r) => (
                  <li key={`${r.game_key}-${r.round_no}`}>
                    {r.game_key} #{r.round_no} — 배팅 {r.pending_bet_count}건
                  </li>
                ))}
              </ul>
              {o.recovery.pending_without_round.length > 20 && (
                <p className="mt-1 text-[11px] text-amber-200/80">… 외 {o.recovery.pending_without_round.length - 20}건</p>
              )}
              <p className="mt-2 text-[11px] text-slate-500">{o.recovery.note}</p>
            </div>
          )}
        </div>
      </div>

      {msg && (
        <p className="rounded-lg border border-premium/30 bg-premium/10 px-3 py-2 text-sm text-slate-200">
          {msg}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="admin-touch-btn rounded-lg bg-amber-600/90 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
          disabled={pollMut.isPending || !token}
          onClick={() => {
            setMsg(null);
            pollMut.mutate();
          }}
        >
          {pollMut.isPending ? "동기화 중…" : "API 동기화 (1회)"}
        </button>
        {o && (
          <div className="flex flex-wrap gap-2 text-xs text-slate-400">
            <span className="rounded-full border border-slate-700 px-2 py-1">
              다음 배팅 회차 <strong className="text-amber-300">{o.next_round}</strong>
            </span>
            <span className="rounded-full border border-slate-700 px-2 py-1">
              PB홀/짝 {o.odds_by_pick?.pb_odd ?? "—"} / {o.odds_by_pick?.pb_even ?? "—"} · 최소{" "}
              {Number(o.min_bet).toLocaleString()}원
            </span>
            <span className="rounded-full border border-slate-700 px-2 py-1">
              env 기본 {o.default_odds_env}
            </span>
            <span className="rounded-full border border-slate-700 px-2 py-1">키 {o.game_key}</span>
          </div>
        )}
      </div>

      <section className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">픽별 배당 설정</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
              v6 포인트 파워볼처럼 홀·짝 등 기본 1.95에서 시작합니다. 조합(<code className="text-slate-500">|</code>
              ) 배팅이면 각 픽 배당을 <strong className="text-slate-500">곱</strong>해 적용됩니다.
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg bg-premium/90 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-premium disabled:opacity-50"
            disabled={oddsSaveMut.isPending || !token || Object.keys(oddsDraft).length === 0}
            onClick={() => {
              setMsg(null);
              oddsSaveMut.mutate();
            }}
          >
            {oddsSaveMut.isPending ? "저장 중…" : "배당 저장"}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {(o?.valid_picks ?? []).map((pk) => (
            <label key={pk} className="block text-[11px] text-slate-500">
              <span className="font-mono text-slate-400">{pk}</span>
              <input
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 tabular-nums"
                value={oddsDraft[pk] ?? ""}
                onChange={(e) => setOddsDraft((d) => ({ ...d, [pk]: e.target.value }))}
                inputMode="decimal"
              />
            </label>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-slate-200">시험 배팅 (내 팀·네트워크 안 회원만)</h3>
          <div className="mt-3 space-y-3">
            <label className="block text-xs text-slate-500">
              user_id
              <input
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="block text-xs text-slate-500">
              픽 (조합은 파이프 | 로 연결)
              <select
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
              >
                {(o?.valid_picks ?? [
                  "sum_odd",
                  "sum_even",
                  "sum_under",
                  "sum_over",
                  "size_s",
                  "size_m",
                  "size_l",
                  "pb_odd",
                  "pb_even",
                  "pb_under",
                  "pb_over",
                ]).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-500">
              금액 (게임머니)
              <input
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="w-full rounded-lg border border-premium/40 bg-premium/15 py-2.5 text-sm font-semibold text-premium hover:bg-premium/25 disabled:opacity-50"
              disabled={betMut.isPending || !token}
              onClick={() => {
                setMsg(null);
                betMut.mutate();
              }}
            >
              {betMut.isPending ? "접수 중…" : "배팅하기"}
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-slate-200">최근 확정 회차</h3>
          <div className="mt-2 max-h-64 overflow-auto text-xs">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500">
                  <th className="py-2 pr-2">회차</th>
                  <th className="py-2 pr-2">PB</th>
                  <th className="py-2">합</th>
                </tr>
              </thead>
              <tbody>
                {(o?.recent_rounds ?? []).map((r) => (
                  <tr key={r.round_no} className="border-b border-slate-800/60 text-slate-300">
                    <td className="py-1.5 pr-2 tabular-nums">{r.round_no}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{r.pb ?? "—"}</td>
                    <td className="py-1.5 tabular-nums">{r.sum ?? "—"}</td>
                  </tr>
                ))}
                {!o?.recent_rounds?.length && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-600">
                      동기화 후 표시됩니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
        <h3 className="text-sm font-semibold text-slate-200">파워볼 배팅 내역</h3>
        <div className="mt-2 overflow-x-auto text-xs">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="py-2 pr-2">id</th>
                <th className="py-2 pr-2">회원</th>
                <th className="py-2 pr-2">회차</th>
                <th className="py-2 pr-2">픽</th>
                <th className="py-2 pr-2">금액</th>
                <th className="py-2 pr-2">배당</th>
                <th className="py-2 pr-2">상태</th>
                <th className="py-2">지급</th>
              </tr>
            </thead>
            <tbody>
              {(betsQ.data?.items ?? []).map((b) => (
                <tr key={b.id} className="border-b border-slate-800/60 text-slate-300">
                  <td className="py-1.5 pr-2 tabular-nums">{b.id}</td>
                  <td className="py-1.5 pr-2">
                    {b.login_id}
                    <span className="ml-1 text-slate-600">#{b.user_id}</span>
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">{b.round_no}</td>
                  <td className="py-1.5 pr-2 font-mono text-[11px]">{b.pick}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{Number(b.amount).toLocaleString()}</td>
                  <td className="py-1.5 pr-2 tabular-nums text-amber-200/80">{b.odds}</td>
                  <td className="py-1.5 pr-2">{b.status}</td>
                  <td className="py-1.5 tabular-nums text-emerald-400/90">
                    {b.payout != null ? Number(b.payout).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
              {!betsQ.data?.items?.length && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-600">
                    내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
