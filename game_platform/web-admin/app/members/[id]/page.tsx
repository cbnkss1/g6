"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MemberRollingRatesPanel } from "@/components/admin/MemberRollingRatesPanel";
import { MemberWalletAdjustDialog } from "@/components/admin/MemberWalletAdjustDialog";
import { adminFetch } from "@/lib/adminFetch";
import { formatMoneyInt } from "@/lib/formatMoney";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type ProfilePermissions = {
  can_wallet_adjust: boolean;
  can_edit_profile: boolean;
};

type Profile = {
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
  referrer_login_id: string | null;
  member_level: number;
  phone: string | null;
  bank_name: string | null;
  bank_account: string | null;
  account_holder: string | null;
  telegram_id: string | null;
  permissions?: ProfilePermissions;
};

type Draft = {
  display_name: string;
  phone: string;
  bank_name: string;
  bank_account: string;
  account_holder: string;
  telegram_id: string;
  member_level: string;
  is_active: boolean;
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

function profileToDraft(p: Profile): Draft {
  return {
    display_name: p.display_name ?? "",
    phone: p.phone ?? "",
    bank_name: p.bank_name ?? "",
    bank_account: p.bank_account ?? "",
    account_holder: p.account_holder ?? "",
    telegram_id: p.telegram_id ?? "",
    member_level: String(p.member_level ?? 1),
    is_active: p.is_active,
  };
}

export default function MemberDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const token = useAuthStore((s) => s.token);
  const base = publicApiBase();
  const qc = useQueryClient();
  const [wallet, setWallet] = useState<null | { mode: "credit" | "debit" }>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin", "user-profile", token ?? "", id],
    queryFn: async () => {
      if (!base || !token || !Number.isFinite(id)) throw new Error("no token");
      const r = await adminFetch(`${base}/admin/users/${id}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as Profile;
    },
    enabled: Boolean(token) && Number.isFinite(id) && id > 0,
    retry: 0,
  });

  const u = q.data;
  const perms = u?.permissions;
  const canWallet = perms?.can_wallet_adjust !== false;
  const canEdit = Boolean(perms?.can_edit_profile);

  useEffect(() => {
    if (q.data) {
      setDraft(profileToDraft(q.data));
      setSaveMsg(null);
    }
  }, [q.data]);

  const patchMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (!base || !token) throw new Error("no token");
      const r = await adminFetch(`${base}/admin/users/${id}/profile`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as Profile;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "user-profile"] });
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setSaveMsg("저장되었습니다.");
    },
    onError: (e: Error) => {
      setSaveMsg(e.message);
    },
  });

  const handleSave = () => {
    if (!u || !draft) return;
    const ml = Number.parseInt(draft.member_level, 10);
    if (!Number.isFinite(ml) || ml < 1 || ml > 99) {
      setSaveMsg("회원 LV는 1~99 숫자여야 합니다.");
      return;
    }
    const body: Record<string, unknown> = {
      display_name: draft.display_name.trim() || null,
      phone: draft.phone.trim() || null,
      bank_name: draft.bank_name.trim() || null,
      bank_account: draft.bank_account.trim() || null,
      account_holder: draft.account_holder.trim() || null,
      telegram_id: draft.telegram_id.trim() || null,
      member_level: ml,
      is_active: draft.is_active,
    };
    patchMut.mutate(body);
  };

  return (
    <div className="member-detail-shell space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/members")}
          className="text-xs text-slate-500 hover:text-premium hover:underline"
        >
          ← 회원 목록
        </button>
      </div>

      {q.isError ? <p className="text-sm text-red-400">{(q.error as Error).message}</p> : null}
      {q.isPending ? <p className="text-sm text-slate-500">불러오는 중…</p> : null}

      {u && draft && (
        <>
          <div>
            <p className="text-premium-label">회원 상세</p>
            <h1
              className="mt-1 text-2xl font-semibold text-slate-50"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              {u.login_id}
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              직속 상위는 <code className="text-slate-500">referrer_id</code> 한 단계입니다. 열 이름·라벨은{" "}
              <Link href="/settings/site-policy" className="text-premium hover:underline">
                사이트 운영 정책
              </Link>
              의 <code className="text-slate-600">admin_ui</code> 로 바꿀 수 있습니다. 지급·회수·상세 수정 허용도
              같은 화면의 <code className="text-slate-600">member_wallet_enabled</code>,{" "}
              <code className="text-slate-600">member_profile_edit_enabled</code> 로 제한할 수 있습니다.{" "}
              <strong className="text-slate-500">슈퍼관리자</strong>는 항상 허용됩니다.
            </p>
          </div>

          <div className="member-profile-card grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-600">표시명</p>
              {canEdit ? (
                <input
                  value={draft.display_name}
                  onChange={(e) => setDraft((d) => (d ? { ...d, display_name: e.target.value } : d))}
                  className="admin-touch-input member-input mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                />
              ) : (
                <p className="mt-1 text-slate-200">{u.display_name ?? "—"}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-600">역할</p>
              <p className="mt-1 text-slate-200">{ROLE_KO[u.role] ?? u.role}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-600">상위 아이디</p>
              <p className="mt-1 font-mono text-premium/90">{u.referrer_login_id ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-600">회원 LV</p>
              {canEdit ? (
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={draft.member_level}
                  onChange={(e) => setDraft((d) => (d ? { ...d, member_level: e.target.value } : d))}
                  className="admin-touch-input member-input mt-1 w-full max-w-[120px] rounded-xl border px-3 py-2 font-mono text-sm"
                  title={u.role !== "player" ? "비플레이어 LV는 슈퍼만 API에서 허용" : undefined}
                />
              ) : (
                <p className="mt-1 text-slate-200">{u.role === "player" ? u.member_level : "—"}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-600">게임머니</p>
              <p className="mt-1 tabular-nums text-lg text-slate-100">{fmtMoney(u.game_money_balance)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-600">롤링</p>
              <p className="mt-1 tabular-nums text-slate-300">{fmtMoney(u.rolling_point_balance)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-600">전화</p>
              {canEdit ? (
                <input
                  value={draft.phone}
                  onChange={(e) => setDraft((d) => (d ? { ...d, phone: e.target.value } : d))}
                  className="admin-touch-input member-input mt-1 w-full font-mono text-sm"
                />
              ) : (
                <p className="mt-1 font-mono text-sm text-slate-400">{u.phone ?? "—"}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-600">텔레그램</p>
              {canEdit ? (
                <input
                  value={draft.telegram_id}
                  onChange={(e) => setDraft((d) => (d ? { ...d, telegram_id: e.target.value } : d))}
                  className="admin-touch-input member-input mt-1 w-full font-mono text-sm"
                />
              ) : (
                <p className="mt-1 font-mono text-sm text-slate-400">{u.telegram_id ?? "—"}</p>
              )}
            </div>
            <div className="sm:col-span-2 space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-slate-600">계좌</p>
              {canEdit ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <input
                    placeholder="은행"
                    value={draft.bank_name}
                    onChange={(e) => setDraft((d) => (d ? { ...d, bank_name: e.target.value } : d))}
                    className="admin-touch-input member-input rounded-xl border px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="계좌번호"
                    value={draft.bank_account}
                    onChange={(e) => setDraft((d) => (d ? { ...d, bank_account: e.target.value } : d))}
                    className="admin-touch-input member-input rounded-xl border px-3 py-2 font-mono text-sm"
                  />
                  <input
                    placeholder="예금주"
                    value={draft.account_holder}
                    onChange={(e) => setDraft((d) => (d ? { ...d, account_holder: e.target.value } : d))}
                    className="admin-touch-input member-input rounded-xl border px-3 py-2 text-sm"
                  />
                </div>
              ) : (
                <p className="text-sm text-slate-300">
                  {[u.bank_name, u.bank_account, u.account_holder].filter(Boolean).join(" · ") || "—"}
                </p>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-600">상태</p>
              {canEdit ? (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={draft.is_active}
                    onChange={(e) => setDraft((d) => (d ? { ...d, is_active: e.target.checked } : d))}
                    className="h-4 w-4 rounded border-slate-600"
                  />
                  활성 계정
                </label>
              ) : u.is_active ? (
                <span className="mt-1 inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                  활성
                </span>
              ) : (
                <span className="mt-1 inline-block rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-red-300">
                  비활성
                </span>
              )}
            </div>
          </div>

          <MemberRollingRatesPanel userId={id} variant="memberDetail" />

          {canEdit ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={patchMut.isPending}
                onClick={() => handleSave()}
                className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg disabled:opacity-50"
              >
                {patchMut.isPending ? "저장 중…" : "변경 저장"}
              </button>
              {saveMsg ? (
                <span className={`text-sm ${saveMsg.includes("저장") ? "text-emerald-400" : "text-red-400"}`}>
                  {saveMsg}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              이 계정으로는 상세 수정이 비활성이거나(사이트 정책), 플레이어가 아닌 회원은 총판·스태프가 수정할 수 없습니다.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            {canWallet ? (
              <>
                <button
                  type="button"
                  onClick={() => setWallet({ mode: "credit" })}
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
                  style={{ background: "linear-gradient(135deg, #22c55e, #15803d)" }}
                >
                  지급
                </button>
                <button
                  type="button"
                  onClick={() => setWallet({ mode: "debit" })}
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
                  style={{ background: "linear-gradient(135deg, #f87171, #b91c1c)" }}
                >
                  회수
                </button>
              </>
            ) : (
              <p className="text-xs text-slate-500">이 사이트에서는 어드민 지급·회수가 비활성화되어 있습니다.</p>
            )}
            <Link
              href={`/members/${u.id}/bet-limits`}
              className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm text-slate-200 hover:border-premium/40"
            >
              파워볼·종목 한도
            </Link>
            <Link href="/cash" className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm text-slate-200 hover:border-premium/40">
              입출금 콘솔
            </Link>
          </div>
        </>
      )}

      {wallet && token && u ? (
        <MemberWalletAdjustDialog
          token={token}
          userId={u.id}
          loginId={u.login_id}
          mode={wallet.mode}
          onClose={() => setWallet(null)}
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: ["admin", "user-profile"] });
            void qc.invalidateQueries({ queryKey: ["admin", "users"] });
          }}
        />
      ) : null}
    </div>
  );
}
