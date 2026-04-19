"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type LevelRow = { level: number; first: string; every: string; ref: string };

type FormState = {
  maintEnabled: boolean;
  maintMsg: string;
  depStart: string;
  depEnd: string;
  depMin: string;
  depUnit: string;
  wdrStart: string;
  wdrEnd: string;
  wdrMin: string;
  wdrReapply: string;
  levels: LevelRow[];
  /** `site_policies.admin_ui.member_upline_label` — 회원 목록 상위 열 헤더 */
  memberUplineLabel: string;
  /** `admin_ui.member_wallet_enabled` — 어드민에서 게임머니 지급·회수 */
  memberWalletEnabled: boolean;
  /** `admin_ui.member_profile_edit_enabled` — 어드민에서 회원 상세(연락처·LV 등) 수정 */
  memberProfileEditEnabled: boolean;
};

const emptyForm = (): FormState => ({
  maintEnabled: false,
  maintMsg: "",
  depStart: "",
  depEnd: "",
  depMin: "",
  depUnit: "",
  wdrStart: "",
  wdrEnd: "",
  wdrMin: "",
  wdrReapply: "",
  levels: Array.from({ length: 6 }, (_, i) => ({
    level: i + 1,
    first: "0",
    every: "0",
    ref: "0",
  })),
  memberUplineLabel: "상위(추천인)",
  memberWalletEnabled: true,
  memberProfileEditEnabled: true,
});

function policiesToForm(p: Record<string, unknown> | undefined): FormState {
  const f = emptyForm();
  if (!p || typeof p !== "object") return f;
  const m = (p.maintenance as Record<string, unknown>) || {};
  f.maintEnabled = Boolean(m.enabled);
  f.maintMsg = String(m.message ?? "");

  const d = (p.deposit as Record<string, unknown>) || {};
  const db = (d.time_block as string[]) || (d.block_if_local_time_between as string[]) || [];
  f.depStart = String(db[0] ?? "");
  f.depEnd = String(db[1] ?? "");
  f.depMin = d.min != null ? String(d.min) : "";
  f.depUnit = d.unit != null ? String(d.unit) : "";

  const w = (p.withdraw as Record<string, unknown>) || {};
  const wb = (w.time_block as string[]) || (w.block_if_local_time_between as string[]) || [];
  f.wdrStart = String(wb[0] ?? "");
  f.wdrEnd = String(wb[1] ?? "");
  f.wdrMin = w.min != null ? String(w.min) : "";
  f.wdrReapply =
    w.reapply_hours_after_approve != null ? String(w.reapply_hours_after_approve) : "";

  const lb = p.level_bonuses;
  if (Array.isArray(lb)) {
    for (let i = 0; i < 6; i++) {
      const row = lb[i] as Record<string, unknown> | undefined;
      if (!row) continue;
      f.levels[i] = {
        level: i + 1,
        first: row.first_deposit_pct != null ? String(row.first_deposit_pct) : "0",
        every: row.every_deposit_pct != null ? String(row.every_deposit_pct) : "0",
        ref: row.referral_deposit_pct != null ? String(row.referral_deposit_pct) : "0",
      };
    }
  }
  const ui = p.admin_ui as Record<string, unknown> | undefined;
  if (ui && typeof ui === "object") {
    if (ui.member_upline_label != null) {
      f.memberUplineLabel = String(ui.member_upline_label);
    }
    if (ui.member_wallet_enabled != null) {
      f.memberWalletEnabled = Boolean(ui.member_wallet_enabled);
    }
    if (ui.member_profile_edit_enabled != null) {
      f.memberProfileEditEnabled = Boolean(ui.member_profile_edit_enabled);
    }
  }
  return f;
}

function formToPoliciesPatch(f: FormState): Record<string, unknown> {
  const level_bonuses = f.levels.map((r) => ({
    level: r.level,
    first_deposit_pct: Number.parseFloat(r.first) || 0,
    every_deposit_pct: Number.parseFloat(r.every) || 0,
    referral_deposit_pct: Number.parseFloat(r.ref) || 0,
  }));
  return {
    maintenance: {
      enabled: f.maintEnabled,
      message: f.maintMsg.trim(),
    },
    deposit: {
      time_block: [f.depStart.trim(), f.depEnd.trim()].every((x) => x) ? [f.depStart.trim(), f.depEnd.trim()] : [],
      min: f.depMin.trim() || undefined,
      unit: f.depUnit.trim() || undefined,
    },
    withdraw: {
      time_block: [f.wdrStart.trim(), f.wdrEnd.trim()].every((x) => x) ? [f.wdrStart.trim(), f.wdrEnd.trim()] : [],
      min: f.wdrMin.trim() || undefined,
      reapply_hours_after_approve: f.wdrReapply.trim() ? Number.parseInt(f.wdrReapply.trim(), 10) : undefined,
    },
    level_bonuses,
    admin_ui: {
      member_upline_label: f.memberUplineLabel.trim() || "상위(추천인)",
      member_wallet_enabled: f.memberWalletEnabled,
      member_profile_edit_enabled: f.memberProfileEditEnabled,
    },
  };
}

export default function SitePolicyPage() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role ?? "");
  const base = publicApiBase();
  const headers = { Authorization: `Bearer ${token}` };
  const qc = useQueryClient();
  const canPatch = role === "super_admin" || role === "owner";
  const isSuper = role === "super_admin";
  const [siteId, setSiteId] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);

  const q = useQuery({
    queryKey: ["admin", "site-policies", token ?? "", siteId],
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
    if (q.data?.policies) setForm(policiesToForm(q.data.policies));
  }, [q.data?.policies]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!base || !token) throw new Error("no token");
      const p = new URLSearchParams();
      if (isSuper && siteId.trim()) p.set("site_id", siteId.trim());
      const policies = formToPoliciesPatch(form);
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

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <p className="text-premium-label">설정</p>
        <h1
          className="mt-1 text-2xl font-semibold text-slate-100"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          사이트 운영 정책
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          레퍼런스 어드민의 <strong className="text-slate-400">사이트 설정</strong>에 대응합니다.{" "}
          <strong className="text-slate-400">입·출금 신청 API</strong>에서 점검·시간대·최소금액·출금 재신청 간격을
          검증합니다. 레벨 보너스(첫충·매충·지인충 %)는{" "}
          <strong className="text-slate-400">입금 승인 시</strong> 자동 지급됩니다(지인 보너스는 추천인에게).
        </p>
        <p className="mt-1 text-xs text-slate-600">
          수정: <strong className="text-slate-500">슈퍼관리자</strong> 또는{" "}
          <strong className="text-slate-500">총판(owner)</strong> / 조회: 스태프 포함 · 시간은{" "}
          <strong className="text-slate-500">Asia/Seoul</strong> 기준
        </p>
      </div>

      {isSuper ? (
        <label className="block max-w-md text-xs text-slate-500">
          site_id (다른 테넌트, 비우면 내 기본 사이트)
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
        <div className="space-y-6">
          <p className="text-xs text-slate-500">
            site_id: <span className="font-mono text-slate-300">{q.data.site_id}</span>
          </p>

          <section className="glass-card-sm space-y-3 p-5">
            <h2 className="text-sm font-semibold text-slate-200">사이트 점검</h2>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.maintEnabled}
                disabled={!canPatch}
                onChange={(e) => setForm((s) => ({ ...s, maintEnabled: e.target.checked }))}
              />
              점검 모드 (플레이어 입출금 신청 차단)
            </label>
            <label className="block text-xs text-slate-500">
              안내 문구
              <textarea
                value={form.maintMsg}
                disabled={!canPatch}
                onChange={(e) => setForm((s) => ({ ...s, maintMsg: e.target.value }))}
                rows={2}
                className="mt-1 w-full max-w-xl rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm text-slate-200"
              />
            </label>
          </section>

          <section className="glass-card-sm space-y-3 p-5">
            <h2 className="text-sm font-semibold text-slate-200">충전(입금) 신청</h2>
            <p className="text-xs text-slate-500">불가 시간대 HH:MM ~ HH:MM (비우면 미사용)</p>
            <div className="flex flex-wrap gap-2">
              <input
                placeholder="15:00"
                value={form.depStart}
                disabled={!canPatch}
                onChange={(e) => setForm((s) => ({ ...s, depStart: e.target.value }))}
                className="w-24 rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 font-mono text-sm"
              />
              <span className="text-slate-500">~</span>
              <input
                placeholder="00:15"
                value={form.depEnd}
                disabled={!canPatch}
                onChange={(e) => setForm((s) => ({ ...s, depEnd: e.target.value }))}
                className="w-24 rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 font-mono text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="text-xs text-slate-500">
                최소 금액
                <input
                  value={form.depMin}
                  disabled={!canPatch}
                  onChange={(e) => setForm((s) => ({ ...s, depMin: e.target.value }))}
                  className="mt-1 block w-40 rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 font-mono text-sm"
                />
              </label>
              <label className="text-xs text-slate-500">
                단위 (최소 이후 배수)
                <input
                  value={form.depUnit}
                  disabled={!canPatch}
                  onChange={(e) => setForm((s) => ({ ...s, depUnit: e.target.value }))}
                  className="mt-1 block w-40 rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 font-mono text-sm"
                />
              </label>
            </div>
          </section>

          <section className="glass-card-sm space-y-3 p-5">
            <h2 className="text-sm font-semibold text-slate-200">환전(출금) 신청</h2>
            <p className="text-xs text-slate-500">불가 시간대 HH:MM ~ HH:MM (비우면 미사용)</p>
            <div className="flex flex-wrap gap-2">
              <input
                placeholder="15:00"
                value={form.wdrStart}
                disabled={!canPatch}
                onChange={(e) => setForm((s) => ({ ...s, wdrStart: e.target.value }))}
                className="w-24 rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 font-mono text-sm"
              />
              <span className="text-slate-500">~</span>
              <input
                placeholder="00:30"
                value={form.wdrEnd}
                disabled={!canPatch}
                onChange={(e) => setForm((s) => ({ ...s, wdrEnd: e.target.value }))}
                className="w-24 rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 font-mono text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="text-xs text-slate-500">
                최소 금액
                <input
                  value={form.wdrMin}
                  disabled={!canPatch}
                  onChange={(e) => setForm((s) => ({ ...s, wdrMin: e.target.value }))}
                  className="mt-1 block w-40 rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 font-mono text-sm"
                />
              </label>
              <label className="text-xs text-slate-500">
                직전 출금 승인 후 재신청(시간)
                <input
                  value={form.wdrReapply}
                  disabled={!canPatch}
                  onChange={(e) => setForm((s) => ({ ...s, wdrReapply: e.target.value }))}
                  className="mt-1 block w-40 rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 font-mono text-sm"
                />
              </label>
            </div>
          </section>

          <section className="glass-card-sm space-y-3 p-5">
            <h2 className="text-sm font-semibold text-slate-200">회원 레벨별 보너스 (%)</h2>
            <p className="text-xs text-slate-500">저장만 됩니다. 승인 시 자동 지급은 추후 구현.</p>
            <div className="overflow-x-auto">
              <table className="min-w-[520px] w-full text-left text-sm text-slate-300">
                <thead className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-2">LV</th>
                    <th className="py-2 pr-2">첫충</th>
                    <th className="py-2 pr-2">매충</th>
                    <th className="py-2">지인충</th>
                  </tr>
                </thead>
                <tbody>
                  {form.levels.map((row, idx) => (
                    <tr key={row.level} className="border-b border-slate-800/60">
                      <td className="py-2 pr-2 text-slate-400">{row.level}</td>
                      <td className="py-2 pr-2">
                        <input
                          value={row.first}
                          disabled={!canPatch}
                          onChange={(e) => {
                            const v = e.target.value;
                            setForm((s) => {
                              const levels = [...s.levels];
                              levels[idx] = { ...levels[idx], first: v };
                              return { ...s, levels };
                            });
                          }}
                          className="w-20 rounded border border-slate-800 bg-slate-950/80 px-2 py-1 font-mono text-xs"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={row.every}
                          disabled={!canPatch}
                          onChange={(e) => {
                            const v = e.target.value;
                            setForm((s) => {
                              const levels = [...s.levels];
                              levels[idx] = { ...levels[idx], every: v };
                              return { ...s, levels };
                            });
                          }}
                          className="w-20 rounded border border-slate-800 bg-slate-950/80 px-2 py-1 font-mono text-xs"
                        />
                      </td>
                      <td className="py-2">
                        <input
                          value={row.ref}
                          disabled={!canPatch}
                          onChange={(e) => {
                            const v = e.target.value;
                            setForm((s) => {
                              const levels = [...s.levels];
                              levels[idx] = { ...levels[idx], ref: v };
                              return { ...s, levels };
                            });
                          }}
                          className="w-20 rounded border border-slate-800 bg-slate-950/80 px-2 py-1 font-mono text-xs"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="glass-card-sm space-y-3 p-5">
            <h2 className="text-sm font-semibold text-slate-200">어드민 · 회원 목록 표시</h2>
            <p className="text-xs text-slate-500">
              하위 조직명(본사/총판 등) 대신 <strong className="text-slate-400">직속 상위 계정</strong> 한 명의{" "}
              <code className="text-slate-600">login_id</code>가 목록에 나갑니다. 아래 문구는 그 열의 헤더 이름입니다.
            </p>
            <label className="block max-w-md text-xs text-slate-500">
              상위 열 이름 (<code className="text-slate-600">admin_ui.member_upline_label</code>)
              <input
                value={form.memberUplineLabel}
                disabled={!canPatch}
                onChange={(e) => setForm((s) => ({ ...s, memberUplineLabel: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm text-slate-200"
                placeholder="예: 추천인, 상위, 에이전트"
              />
            </label>
            <div className="mt-4 space-y-3 border-t border-slate-800/80 pt-4">
              <p className="text-xs text-slate-500">
                아래는 <strong className="text-slate-400">사이트 전역</strong> 스위치입니다.{" "}
                <strong className="text-slate-400">회원 목록</strong>의 지급·회수 버튼은 여기가 켜져 있고, 총판·스태프
                계정에 지급·회수가 허용된 경우에만 표시됩니다(AND). 끄면 총판·스태프는 모두 불가이고,{" "}
                <strong className="text-slate-400">슈퍼관리자</strong>는 항상 가능합니다. 계정별 플래그는 API로
                조정합니다.
              </p>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={form.memberWalletEnabled}
                  disabled={!canPatch}
                  onChange={(e) => setForm((s) => ({ ...s, memberWalletEnabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-600"
                />
                <span>
                  게임머니 지급·회수 허용 (<code className="text-slate-600">member_wallet_enabled</code>)
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={form.memberProfileEditEnabled}
                  disabled={!canPatch}
                  onChange={(e) => setForm((s) => ({ ...s, memberProfileEditEnabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-600"
                />
                <span>
                  (레거시) 회원 상세 수정 플래그 — 실제 프로필·연락처 저장은{" "}
                  <strong className="text-slate-400">슈퍼관리자만</strong> 가능 (
                  <code className="text-slate-600">member_profile_edit_enabled</code>)
                </span>
              </label>
            </div>
          </section>

          {canPatch ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={mut.isPending}
                onClick={() => mut.mutate()}
                className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg disabled:opacity-50"
              >
                {mut.isPending ? "저장 중…" : "저장"}
              </button>
              {mut.isError ? <span className="text-sm text-red-400">{(mut.error as Error).message}</span> : null}
              {mut.isSuccess ? <span className="text-sm text-emerald-400">저장됨</span> : null}
            </div>
          ) : (
            <p className="text-xs text-slate-500">이 계정은 조회만 가능합니다.</p>
          )}
        </div>
      )}
    </div>
  );
}
