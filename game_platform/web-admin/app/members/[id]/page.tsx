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
  can_wallet_credit?: boolean;
  can_wallet_debit?: boolean;
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
  /** 총판·스태프에게 이 회원 지급·회수 허용(슈퍼는 항상 가능) */
  member_list_wallet_enabled?: boolean;
  /** 대상 계정이 하부 관리자 제한 모드인지(슈퍼가 설정) */
  admin_partner_limited_ui?: boolean;
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
  const authRole = useAuthStore((s) => s.user?.role ?? "");
  const viewerPartnerLimited = useAuthStore((s) => s.user?.admin_partner_limited_ui === true);
  const setUser = useAuthStore((s) => s.setUser);
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
  const canWalletCredit = (perms?.can_wallet_credit ?? perms?.can_wallet_adjust) !== false;
  const canWalletDebit = (perms?.can_wallet_debit ?? perms?.can_wallet_adjust) !== false;
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

  const canPatchWalletFlag =
    authRole === "super_admin" || authRole === "owner" || authRole === "staff";

  const partnerUiMut = useMutation({
    mutationFn: async (next: boolean) => {
      if (!base || !token) throw new Error("no token");
      const r = await adminFetch(`${base}/admin/users/${id}/partner-limited-ui`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ admin_partner_limited_ui: next }),
      });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as { id: number; admin_partner_limited_ui: boolean };
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["admin", "user-profile"] });
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
      if (data.id === useAuthStore.getState().user?.id) {
        const u = useAuthStore.getState().user;
        if (u) setUser({ ...u, admin_partner_limited_ui: data.admin_partner_limited_ui });
      }
    },
  });

  const walletFlagMut = useMutation({
    mutationFn: async (next: boolean) => {
      if (!base || !token) throw new Error("no token");
      const r = await adminFetch(`${base}/admin/users/${id}/member-list-wallet`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ member_list_wallet_enabled: next }),
      });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as Profile;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "user-profile"] });
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
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
              의 <code className="text-slate-600">admin_ui</code> 로 바꿀 수 있습니다. 게임머니{" "}
              <strong className="text-slate-400">지급·회수</strong>는 회원 목록·이 화면 버튼으로 처리하고,{" "}
              <strong className="text-slate-400">프로필·연락처·활성 등 상세 수정</strong>은{" "}
              <strong className="text-slate-300">슈퍼관리자</strong>만 저장할 수 있습니다. 회원 목록과 동일하게{" "}
              <strong className="text-slate-400">아래 스위치</strong>로 총판·스태프에게 이 회원 지급·회수를 줄지 말지 정할 수 있습니다.
            </p>
          </div>

          {canPatchWalletFlag ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-200">이 회원 — 지급·회수 대상 (총판·스태프)</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  끄면 총판·스태프는 이 회원에게 지급·회수 불가. 슈퍼관리자는 항상 가능.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold ${u.member_list_wallet_enabled !== false ? "text-emerald-400" : "text-slate-500"}`}>
                  {u.member_list_wallet_enabled !== false ? "ON" : "OFF"}
                </span>
                <button
                  type="button"
                  disabled={walletFlagMut.isPending}
                  onClick={() => walletFlagMut.mutate(!(u.member_list_wallet_enabled !== false))}
                  className={`relative h-8 w-14 rounded-full transition-colors disabled:opacity-50 ${
                    u.member_list_wallet_enabled !== false ? "bg-emerald-600/85" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                      u.member_list_wallet_enabled !== false ? "left-7" : "left-1"
                    }`}
                  />
                </button>
              </div>
              {walletFlagMut.isError ? (
                <p className="w-full text-xs text-red-400">{(walletFlagMut.error as Error).message}</p>
              ) : null}
            </div>
          ) : null}

          {authRole === "super_admin" && (u.role === "owner" || u.role === "staff") ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/25 bg-amber-950/20 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-200">하부 관리자 제한 모드 (대시보드·내역·회원 범위)</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  켜면 이 계정은 비밀번호 변경·하부 데이터만 보며 요율은 조회만, 게임 관리 메뉴는 숨깁니다.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold ${u.admin_partner_limited_ui === true ? "text-amber-400" : "text-slate-500"}`}
                >
                  {u.admin_partner_limited_ui === true ? "ON" : "OFF"}
                </span>
                <button
                  type="button"
                  disabled={partnerUiMut.isPending}
                  onClick={() => partnerUiMut.mutate(!(u.admin_partner_limited_ui === true))}
                  className={`relative h-8 w-14 rounded-full transition-colors disabled:opacity-50 ${
                    u.admin_partner_limited_ui === true ? "bg-amber-600/85" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                      u.admin_partner_limited_ui === true ? "left-7" : "left-1"
                    }`}
                  />
                </button>
              </div>
              {partnerUiMut.isError ? (
                <p className="w-full text-xs text-red-400">{(partnerUiMut.error as Error).message}</p>
              ) : null}
            </div>
          ) : null}

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

          <MemberRollingRatesPanel
            userId={id}
            variant="memberDetail"
            readOnly={viewerPartnerLimited || authRole === "player"}
          />

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
              표시명·연락처·계좌·활성 등 <strong className="text-slate-400">상세 저장</strong>은 슈퍼관리자만 할 수 있습니다. 아래
              롤링 요율·지급·회수는 권한이 있으면 그대로 이용하세요.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            {canWalletCredit ? (
              <button
                type="button"
                onClick={() => setWallet({ mode: "credit" })}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #22c55e, #15803d)" }}
              >
                지급
              </button>
            ) : null}
            {canWalletDebit ? (
              <button
                type="button"
                onClick={() => setWallet({ mode: "debit" })}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #f87171, #b91c1c)" }}
              >
                회수
              </button>
            ) : null}
            {!canWalletCredit && !canWalletDebit ? (
              <p className="text-xs text-slate-500">지급·회수 권한이 없습니다. (사이트 정책 또는 본인 계정 설정)</p>
            ) : null}
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
