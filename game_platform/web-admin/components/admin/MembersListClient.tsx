"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MemberWalletAdjustDialog } from "@/components/admin/MemberWalletAdjustDialog";
import { adminFetch } from "@/lib/adminFetch";
import { formatMoneyInt } from "@/lib/formatMoney";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

export type MemberRow = {
  id: number;
  login_id: string;
  display_name: string | null;
  role: string;
  site_id: string;
  game_money_balance: string;
  rolling_point_balance: string;
  is_active: boolean;
  is_store_enabled: boolean;
  referrer_id: number | null;
  referrer_login_id?: string | null;
  member_level?: number;
  can_wallet_adjust?: boolean;
  can_edit_profile?: boolean;
};

const ROLE_KO: Record<string, string> = {
  player: "회원",
  owner: "총판",
  staff: "스태프",
  super_admin: "슈퍼",
};

function fmtMoney(v: string) {
  return formatMoneyInt(v);
}

type Props = {
  title: string;
  subtitle?: string;
  /** null=전체, true=활성만, false=비활성(제재)만 */
  initialIsActive: boolean | null;
  /** 제재 전용 페이지면 전체 목록 링크만 표시 */
  variant?: "default" | "blocked";
};

export function MembersListClient({ title, subtitle, initialIsActive, variant = "default" }: Props) {
  const token = useAuthStore((s) => s.token);
  const base = publicApiBase();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const initialActiveStr: "" | "true" | "false" =
    initialIsActive === true ? "true" : initialIsActive === false ? "false" : "";
  const [activeFilter, setActiveFilter] = useState<"" | "true" | "false">(initialActiveStr);
  const [applied, setApplied] = useState({ q: "", role: "", active: initialActiveStr });
  const [wallet, setWallet] = useState<null | { userId: number; loginId: string; mode: "credit" | "debit" }>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (applied.q.trim()) p.set("q", applied.q.trim());
    if (applied.role.trim()) p.set("role", applied.role.trim());
    if (applied.active === "true") p.set("is_active", "true");
    if (applied.active === "false") p.set("is_active", "false");
    p.set("limit", "80");
    p.set("offset", "0");
    return p;
  }, [applied]);

  const query = useQuery({
    queryKey: ["admin", "users", token ?? "", applied],
    queryFn: async () => {
      if (!base || !token) throw new Error("no token");
      const r = await adminFetch(`${base}/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as {
        items: MemberRow[];
        member_list_meta?: { upline_column_label?: string };
      };
    },
    enabled: Boolean(token),
    refetchInterval: 30_000,
    retry: 0,
  });

  const items = query.data?.items ?? [];
  const uplineLabel = query.data?.member_list_meta?.upline_column_label ?? "상위(추천인)";

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-premium-label">회원</p>
          <h1
            className="mt-1 text-2xl font-semibold text-slate-100"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            {title}
          </h1>
          {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
          <p className="mt-1 text-[11px] text-slate-600">
            <strong className="text-slate-500">{uplineLabel}</strong> 열은 직속 상위 계정(<code className="text-slate-600">referrer_id</code>)입니다.
            표시 이름은 <Link href="/settings/site-policy" className="text-premium hover:underline">사이트 운영 정책</Link>에서{" "}
            <code className="text-slate-600">admin_ui.member_upline_label</code> 로 변경할 수 있습니다.
          </p>
        </div>
        {variant === "blocked" ? (
          <Link href="/members" className="text-xs text-emerald-400/90 hover:underline">
            전체 회원 목록 →
          </Link>
        ) : (
          <Link href="/members/blocked" className="text-xs text-amber-400/90 hover:underline">
            비활성(제재)만 보기 →
          </Link>
        )}
      </div>

      <div className="glass-card-sm flex flex-col flex-wrap gap-3 p-4 sm:flex-row sm:items-end">
        <label className="flex min-w-[140px] flex-1 flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-widest text-slate-600">아이디 검색</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="부분 일치"
            className="admin-touch-input rounded-xl border border-slate-800 bg-slate-950/80 px-3 text-sm text-slate-100 outline-none focus:border-premium/40"
          />
        </label>
        <label className="flex min-w-[120px] flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-widest text-slate-600">역할</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="admin-touch-input rounded-xl border border-slate-800 bg-slate-950/80 px-3 text-sm text-slate-100 outline-none focus:border-premium/40"
          >
            <option value="">전체</option>
            <option value="player">회원(player)</option>
            <option value="owner">총판(owner)</option>
            <option value="staff">스태프(staff)</option>
          </select>
        </label>
        <label className="flex min-w-[120px] flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-widest text-slate-600">활성</span>
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as "" | "true" | "false")}
            className="admin-touch-input rounded-xl border border-slate-800 bg-slate-950/80 px-3 text-sm text-slate-100 outline-none focus:border-premium/40"
          >
            <option value="">전체</option>
            <option value="true">활성만</option>
            <option value="false">비활성(제재)</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => setApplied({ q, role, active: activeFilter })}
          className="admin-touch-btn rounded-xl px-6 text-sm font-semibold text-slate-950 transition-all hover:shadow-glow-gold"
          style={{ background: "linear-gradient(135deg, #d4af37, #f0e2a8, #8a7530)" }}
        >
          조회
        </button>
      </div>

      {query.isLoading && <p className="text-sm text-slate-500">불러오는 중…</p>}
      {query.isError && (
        <p className="text-sm text-red-400">목록을 불러오지 못했습니다. API·로그인을 확인하세요.</p>
      )}

      {!query.isLoading && !query.isError && items.length === 0 && (
        <div className="glass-card-sm rounded-2xl py-14 text-center text-sm text-slate-500">조건에 맞는 회원이 없습니다.</div>
      )}

      {!query.isLoading && items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/40">
          <table className="min-w-[920px] w-full text-left text-xs text-slate-300">
            <thead className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">아이디</th>
                <th className="px-3 py-2">표시명</th>
                <th className="px-3 py-2">역할</th>
                <th className="px-3 py-2 max-w-[140px]" title={uplineLabel}>
                  {uplineLabel}
                </th>
                <th className="px-3 py-2">LV</th>
                <th className="px-3 py-2 text-right">게임머니</th>
                <th className="px-3 py-2 text-right">롤링</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2 text-center">지급</th>
                <th className="px-3 py-2 text-center">회수</th>
                <th className="px-3 py-2">상세</th>
                <th className="px-3 py-2">한도</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id} className="border-b border-slate-800/60 hover:bg-slate-900/50">
                  <td className="px-3 py-2 font-mono text-slate-500">{u.id}</td>
                  <td className="px-3 py-2 font-medium text-slate-100">{u.login_id}</td>
                  <td className="px-3 py-2 text-slate-400">{u.display_name ?? "—"}</td>
                  <td className="px-3 py-2">{ROLE_KO[u.role] ?? u.role}</td>
                  <td className="max-w-[140px] truncate px-3 py-2 font-mono text-[11px] text-premium/80" title={u.referrer_login_id ?? ""}>
                    {u.referrer_login_id ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-400">
                    {u.role === "player" ? (u.member_level ?? 1) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(u.game_money_balance)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmtMoney(u.rolling_point_balance)}</td>
                  <td className="px-3 py-2">
                    {u.is_active ? (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                        활성
                      </span>
                    ) : (
                      <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-red-300">
                        비활성
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {u.can_wallet_adjust !== false ? (
                      <button
                        type="button"
                        onClick={() => setWallet({ userId: u.id, loginId: u.login_id, mode: "credit" })}
                        className="rounded-lg px-2 py-1 text-[10px] font-semibold text-white"
                        style={{ background: "linear-gradient(135deg, #22c55e, #15803d)" }}
                      >
                        지급
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-600" title="사이트 정책으로 비활성">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {u.can_wallet_adjust !== false ? (
                      <button
                        type="button"
                        onClick={() => setWallet({ userId: u.id, loginId: u.login_id, mode: "debit" })}
                        className="rounded-lg px-2 py-1 text-[10px] font-semibold text-white"
                        style={{ background: "linear-gradient(135deg, #f87171, #b91c1c)" }}
                      >
                        회수
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-600" title="사이트 정책으로 비활성">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/members/${u.id}`} className="text-[10px] text-sky-400 hover:underline">
                      상세정보
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/members/${u.id}/bet-limits`} className="text-[10px] text-premium hover:underline">
                      설정
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {wallet && token ? (
        <MemberWalletAdjustDialog
          token={token}
          userId={wallet.userId}
          loginId={wallet.loginId}
          mode={wallet.mode}
          onClose={() => setWallet(null)}
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: ["admin", "users"] });
          }}
        />
      ) : null}
    </div>
  );
}
