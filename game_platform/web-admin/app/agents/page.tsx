"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { formatMoneyInt } from "@/lib/formatMoney";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

// ─── 타입 ─────────────────────────────────────────────────────────────────────
type Partner = {
  id: number;
  login_id: string;
  display_name: string | null;
  is_active: boolean;
  is_partner: boolean;
  game_money_balance: string;
  rolling_point_balance: string;
  casino_rolling: number;
  slot_rolling: number;
  casino_settle: number;
  slot_settle: number;
  child_count: number;
  referrer_id: number | null;
};

type Modal =
  | { type: "create"; parentId: number; parentLogin: string }
  | { type: "rates"; partner: Partner }
  | { type: "pay"; partner: Partner }
  | { type: "collect"; partner: Partner }
  | { type: "pw"; partner: Partner };

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────
const DEPTH_COLORS = ["#d4af37", "#60a5fa", "#34d399", "#a78bfa", "#f87171", "#fb923c"];

function fmtMoney(v: string | number) {
  return formatMoneyInt(v);
}

// ─── 하위 트리 행 (재귀 확장) ─────────────────────────────────────────────────
function PartnerRow({
  partner,
  depth,
  token,
  base,
  onModal,
  myId,
  treeEpoch,
}: {
  partner: Partner;
  depth: number;
  token: string;
  base: string;
  onModal: (m: Modal) => void;
  myId: number;
  /** 증가 시 이 행 포함 하위가 모두 접힘(리마운트) */
  treeEpoch: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)];
  const qc = useQueryClient();

  const childQ = useQuery({
    queryKey: ["partners", "children", partner.id],
    queryFn: async () => {
      const r = await fetch(`${base}/admin/partners?parent_id=${partner.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error("load fail");
      return (await r.json()) as { items: Partner[] };
    },
    enabled: expanded,
  });

  const toggleMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${base}/admin/partners/${partner.id}/toggle`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("toggle fail");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partners"] });
    },
  });

  const hasChildrenHint = partner.child_count > 0;

  return (
    <>
      {/* 팀 네트워크 행 (동일 회원, referrer 체인) */}
      <div
        className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-3 transition-all hover:bg-slate-800/20 ${
          !partner.is_active ? "opacity-50" : ""
        }`}
        style={{ marginLeft: `${depth * 20}px` }}
      >
        {/* depth 라인 + 토글 버튼 */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* depth 인디케이터 */}
          <div
            className="flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-bold shrink-0"
            style={{ background: `${color}15`, color, border: `1px solid ${color}25` }}
          >
            {depth}
          </div>
          {/* 직속 팀(1단): 항상 펼침. child_count=0 이라도 실제 팀원이 있을 수 있어 항상 표시 */}
          <button
            type="button"
            title={
              hasChildrenHint
                ? expanded
                  ? "아래 단 접기"
                  : `직속 팀 ${partner.child_count}명 펼치기`
                : expanded
                  ? "접기"
                  : "직속 팀 보기 (다음 단)"
            }
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className={`flex h-6 w-6 items-center justify-center rounded-lg text-[10px] transition-all hover:bg-slate-700 ${
              hasChildrenHint ? "" : "opacity-50"
            }`}
            style={{ color: hasChildrenHint ? color : "#64748b" }}
          >
            {expanded ? "▼" : "▶"}
          </button>
        </div>

        {/* 상태 배지 */}
        <span
          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${
            partner.is_active
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-slate-700 bg-slate-800 text-slate-600"
          }`}
        >
          {partner.is_active ? "ON" : "OFF"}
        </span>

        {/* 이름 + 아이디 */}
        <div className="flex-1 min-w-[120px]">
          <p className="font-semibold text-sm text-slate-100 truncate">
            {partner.display_name || partner.login_id}
          </p>
          <p className="text-[10px] text-slate-600 font-mono">{partner.login_id}</p>
        </div>

        {/* 요율 */}
        <div className="hidden sm:flex gap-3 text-[10px] text-slate-500">
          <span>카지노R <b className="text-premium">{partner.casino_rolling}%</b></span>
          <span>슬롯R <b className="text-blue-400">{partner.slot_rolling}%</b></span>
        </div>

        {/* 보유금 */}
        <div className="text-right shrink-0">
          <p className="font-bold tabular-nums text-sm text-slate-100">
            {fmtMoney(partner.game_money_balance)}
            <span className="text-[10px] text-slate-600 ml-0.5">원</span>
          </p>
          <p className="text-[9px] text-slate-600">
            {hasChildrenHint ? `팀원 ${partner.child_count}명` : "팀원 · 펼쳐서 확인"}
          </p>
        </div>

        {/* 액션 버튼 그룹 */}
        <div className="flex flex-wrap gap-1 shrink-0">
          <button
            onClick={() => onModal({ type: "pay", partner })}
            className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white admin-touch-btn"
            style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)", minHeight: 36 }}
          >
            지급
          </button>
          <button
            onClick={() => onModal({ type: "collect", partner })}
            className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white admin-touch-btn"
            style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)", minHeight: 36 }}
          >
            회수
          </button>
          <button
            onClick={() => onModal({ type: "rates", partner })}
            className="rounded-lg border border-premium/30 px-2.5 py-1.5 text-[11px] font-semibold text-premium admin-touch-btn hover:bg-premium/10"
            style={{ minHeight: 36 }}
          >
            요율
          </button>
          <button
            onClick={() => onModal({ type: "create", parentId: partner.id, parentLogin: partner.login_id })}
            className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 admin-touch-btn hover:border-emerald-500/40 hover:text-emerald-400"
            style={{ minHeight: 36 }}
          >
            + 팀원 추가
          </button>
          <button
            onClick={() => toggleMut.mutate()}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold admin-touch-btn border ${
              partner.is_active
                ? "border-slate-700 text-slate-500 hover:border-red-500/30 hover:text-red-400"
                : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
            }`}
            style={{ minHeight: 36 }}
          >
            {partner.is_active ? "OFF" : "ON"}
          </button>
        </div>
      </div>

      {/* 하위 트리 (재귀) */}
      {expanded && (
        <div className="border-l ml-6" style={{ borderColor: `${color}15` }}>
          {childQ.isLoading && (
            <div className="ml-8 py-2 text-[11px] text-slate-600 animate-pulse">로드 중…</div>
          )}
          {childQ.isSuccess &&
            childQ.data.items.map((child) => (
              <PartnerRow
                key={`${child.id}-${treeEpoch}`}
                partner={child}
                depth={depth + 1}
                token={token}
                base={base}
                onModal={onModal}
                myId={myId}
                treeEpoch={treeEpoch}
              />
            ))}
          {childQ.isSuccess && childQ.data.items.length === 0 && (
            <div className="ml-8 py-2 text-[11px] text-slate-700">
              직속 팀원 없음 (추천인이 본인인 계정이 아직 없음)
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── 팀원(회원) 생성 모달 — player/owner만, 요율 있으면 정산 네트워크 대상 ─────────
function readApiErrorDetail(d: unknown): string {
  if (!d || typeof d !== "object") return "요청 실패";
  const o = d as { detail?: unknown };
  const x = o.detail;
  if (typeof x === "string") return x;
  if (Array.isArray(x)) {
    return x
      .map((it) => (it && typeof it === "object" && "msg" in it ? String((it as { msg: unknown }).msg) : JSON.stringify(it)))
      .join(" ");
  }
  return "요청 실패";
}

function CreateModal({
  parentId,
  parentLogin,
  token,
  base,
  onClose,
}: {
  parentId: number;
  parentLogin: string;
  token: string;
  base: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);
  const [form, setForm] = useState({
    login_id: "",
    password: "",
    display_name: "",
    bank_name: "",
    bank_account: "",
    account_holder: "",
    phone: "",
    role: "player" as "player" | "owner",
    casino_rolling: "0",
    slot_rolling: "0",
    casino_settle: "0",
    slot_settle: "0",
  });
  const [err, setErr] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${base}/admin/partners`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          login_id: form.login_id,
          password: form.password,
          display_name: form.display_name || undefined,
          bank_name: form.bank_name || undefined,
          bank_account: form.bank_account || undefined,
          account_holder: form.account_holder || undefined,
          phone: form.phone || undefined,
          role: form.role,
          casino_rolling: parseFloat(form.casino_rolling),
          slot_rolling: parseFloat(form.slot_rolling),
          casino_settle: parseFloat(form.casino_settle),
          slot_settle: parseFloat(form.slot_settle),
          referrer_id_override: parentId,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = readApiErrorDetail(d);
        if (r.status === 401) {
          clear();
          setTimeout(() => router.replace("/login"), 800);
          throw new Error(`${msg} — 로그인 화면으로 이동합니다.`);
        }
        throw new Error(msg);
      }
      return d;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partners"] });
      onClose();
    },
    onError: (e: Error) => setErr(e.message),
  });

  const field = (label: string, key: keyof typeof form, type = "text", hint = "") => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-widest text-slate-600">
        {label} {hint && <span className="text-slate-700 normal-case">({hint})</span>}
      </span>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
        className="admin-touch-input rounded-xl border border-slate-800 bg-slate-950/80 px-4 text-sm text-slate-100 outline-none focus:border-premium/40"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-md overflow-y-auto rounded-2xl p-6 space-y-4 max-h-[90vh]"
        style={{ background: "rgba(8,15,28,0.98)", border: "1px solid rgba(212,175,55,0.2)", boxShadow: "0 0 80px rgba(0,0,0,0.8)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-premium-label">계정 생성</p>
            <p className="mt-0.5 text-sm text-slate-400">
              상위 <span className="text-premium font-semibold">{parentLogin}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-300 text-xl">✕</button>
        </div>

        <div className="premium-divider" />

        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-widest text-slate-600">
              계정 유형
            </span>
            <div className="flex gap-3 text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-slate-300">
                <input
                  type="radio"
                  name="create-role"
                  checked={form.role === "player"}
                  onChange={() => setForm((p) => ({ ...p, role: "player" }))}
                  className="accent-premium"
                />
                배팅 회원 (player)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-slate-300">
                <input
                  type="radio"
                  name="create-role"
                  checked={form.role === "owner"}
                  onChange={() => setForm((p) => ({ ...p, role: "owner" }))}
                  className="accent-premium"
                />
                총판·어드민 (owner)
              </label>
            </div>
            <p className="text-[9px] leading-relaxed text-slate-600">
              모두 같은 회원입니다. 요율이 있으면 롤링·정산 네트워크에 참여하고, 추천인 체인으로 A→B→C… 다단계
              팀이 이어집니다.
            </p>
          </div>
          {field("아이디", "login_id")}
          {field("비밀번호", "password", "password")}
          {field("표시 이름", "display_name")}
          {field("거래은행", "bank_name")}
          {field("계좌번호", "bank_account")}
          {field("예금주", "account_holder")}
          {field("전화번호", "phone", "tel")}

          <div className="premium-divider" />
          <p className="text-[10px] text-slate-600 uppercase tracking-widest">요율 설정</p>

          <div className="grid grid-cols-2 gap-3">
            {[
              ["카지노 롤링 (%)", "casino_rolling"],
              ["슬롯 롤링 (%)", "slot_rolling"],
              ["카지노 정산 (%)", "casino_settle"],
              ["슬롯 정산 (%)", "slot_settle"],
            ].map(([label, key]) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-600">{label}</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                  className="admin-touch-input rounded-xl border border-slate-800 bg-slate-950/80 px-3 text-sm text-premium outline-none focus:border-premium/40 tabular-nums"
                />
              </label>
            ))}
          </div>
        </div>

        {err && (
          <div className="rounded-xl border border-red-500/20 bg-red-950/20 px-4 py-2 text-sm text-red-400">
            ✕ {err}
          </div>
        )}

        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending || !form.login_id || !form.password}
          className="admin-touch-btn w-full rounded-xl font-bold text-slate-950 transition-all hover:opacity-90 disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #d4af37, #f0e2a8, #8a7530)" }}
        >
          {mut.isPending ? "처리 중…" : "생성"}
        </button>
      </div>
    </div>
  );
}

// ─── 요율 설정 모달 ────────────────────────────────────────────────────────────
function RatesModal({
  partner,
  token,
  base,
  onClose,
}: {
  partner: Partner;
  token: string;
  base: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [rates, setRates] = useState({
    casino_rolling: String(partner.casino_rolling),
    slot_rolling: String(partner.slot_rolling),
    casino_settle: String(partner.casino_settle),
    slot_settle: String(partner.slot_settle),
  });
  const [err, setErr] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${base}/admin/partners/${partner.id}/rates`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          casino_rolling: parseFloat(rates.casino_rolling),
          slot_rolling: parseFloat(rates.slot_rolling),
          casino_settle: parseFloat(rates.casino_settle),
          slot_settle: parseFloat(rates.slot_settle),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "저장 실패");
      return d;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partners"] });
      onClose();
    },
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{ background: "rgba(8,15,28,0.98)", border: "1px solid rgba(212,175,55,0.2)", boxShadow: "0 0 80px rgba(0,0,0,0.8)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-premium-label">요율 설정</p>
            <p className="mt-0.5 text-sm font-bold text-slate-100">{partner.login_id}</p>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-300 text-xl">✕</button>
        </div>
        <div className="premium-divider" />
        <div className="space-y-3">
          {[
            ["카지노 롤링 (%)", "casino_rolling", "1.2~3%"],
            ["슬롯 롤링 (%)", "slot_rolling", "4.1~6%"],
            ["카지노 정산 (%)", "casino_settle", "40~6%"],
            ["슬롯 정산 (%)", "slot_settle", "40~6%"],
          ].map(([label, key, hint]) => (
            <label key={key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest">{label}</span>
                <span className="text-[9px] text-slate-700">{hint}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  step="0.1"
                  min="0"
                  max="50"
                  value={rates[key as keyof typeof rates]}
                  onChange={(e) => setRates((p) => ({ ...p, [key]: e.target.value }))}
                  className="flex-1 accent-premium"
                />
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={rates[key as keyof typeof rates]}
                  onChange={(e) => setRates((p) => ({ ...p, [key]: e.target.value }))}
                  className="w-16 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-center text-sm font-bold text-premium outline-none focus:border-premium/40 tabular-nums"
                />
              </div>
            </label>
          ))}
        </div>
        {err && <p className="text-sm text-red-400">✕ {err}</p>}
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className="admin-touch-btn w-full rounded-xl font-bold text-slate-950 disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #d4af37, #f0e2a8, #8a7530)" }}
        >
          {mut.isPending ? "저장 중…" : "요율 저장"}
        </button>
      </div>
    </div>
  );
}

// ─── 머니 지급 / 회수 모달 ─────────────────────────────────────────────────────
function MoneyModal({
  type,
  partner,
  token,
  base,
  onClose,
}: {
  type: "pay" | "collect";
  partner: Partner;
  token: string;
  base: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState("");
  const isPay = type === "pay";
  const maxAmount = isPay ? undefined : fmtMoney(partner.game_money_balance);

  const mut = useMutation({
    mutationFn: async () => {
      const endpoint = isPay ? "pay" : "collect";
      const r = await fetch(`${base}/admin/partners/${partner.id}/${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "처리 실패");
      return d;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partners"] });
      onClose();
    },
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{ background: "rgba(8,15,28,0.98)", border: `1px solid ${isPay ? "rgba(220,38,38,0.3)" : "rgba(37,99,235,0.3)"}`, boxShadow: "0 0 80px rgba(0,0,0,0.8)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-premium-label">머니 {isPay ? "지급" : "회수"}</p>
            <p className="mt-0.5 text-sm text-slate-400">
              대상: <span className="font-bold text-slate-100">{partner.login_id}</span>
              {!isPay && <span className="ml-2 text-[11px] text-slate-600">보유 {fmtMoney(partner.game_money_balance)}원</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-300 text-xl">✕</button>
        </div>

        <input
          type="number"
          inputMode="numeric"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="admin-touch-input w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 text-center text-2xl font-bold tabular-nums text-slate-100 outline-none focus:border-premium/40"
          style={{ minHeight: 60 }}
          autoFocus
        />

        {!isPay && (
          <button
            onClick={() => setAmount(String(Math.floor(Number(partner.game_money_balance))))}
            className="w-full rounded-xl border border-slate-800 py-1.5 text-xs text-slate-500 hover:text-premium hover:border-premium/30 transition-all"
          >
            전액 회수 ({fmtMoney(partner.game_money_balance)}원)
          </button>
        )}

        {err && <p className="text-sm text-red-400">✕ {err}</p>}

        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending || !amount || Number(amount) <= 0}
          className="admin-touch-btn w-full rounded-xl font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
          style={{
            background: isPay
              ? "linear-gradient(135deg,#dc2626,#b91c1c)"
              : "linear-gradient(135deg,#2563eb,#1d4ed8)",
          }}
        >
          {mut.isPending ? "처리 중…" : `머니 ${isPay ? "지급" : "회수"}`}
        </button>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function AgentsPage() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const base = publicApiBase();
  const qc = useQueryClient();
  const [modal, setModal] = useState<Modal | null>(null);
  const onModal = useCallback((m: Modal) => setModal(m), []);
  /** 증가 시 전체 트리 행 리마운트 → 모두 접힘 */
  const [treeEpoch, setTreeEpoch] = useState(0);

  // 최상위 1단 목록 조회
  const rootQ = useQuery({
    queryKey: ["partners", user?.id ?? 0],
    queryFn: async () => {
      const r = await fetch(`${base}/admin/partners`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error("load fail");
      return (await r.json()) as { items: Partner[] };
    },
    enabled: !!token,
    refetchInterval: 30_000,
  });

  const partners = rootQ.data?.items ?? [];
  const totalBalance = partners.reduce((s, p) => s + Number(p.game_money_balance), 0);

  return (
    <div className="space-y-4 animate-fade-up">
      {/* 헤더 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-premium-label">팀 네트워크</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-100"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            내 팀 · 다단계
          </h1>
          <p className="text-[10px] text-slate-600 mt-0.5 leading-relaxed">
            같은 회원 DB입니다. 추천인만 맞으면 누구나 팀을 데려와 A→B→C→… 처럼 단계가 쌓이고, 요율이 있으면 그
            흐름에서 정산·롤링 대상이 됩니다. ▶ 로 직속 한 단씩 펼칩니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTreeEpoch((n) => n + 1)}
            className="rounded-2xl border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-400 transition-all hover:border-slate-500 hover:text-slate-200"
          >
            모두 접기
          </button>
          <button
            onClick={() => setModal({ type: "create", parentId: user?.id ?? 0, parentLogin: user?.login_id ?? "me" })}
            className="admin-touch-btn rounded-2xl px-5 font-bold text-slate-950 transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#d4af37,#f0e2a8,#8a7530)" }}
          >
            + 계정 생성
          </button>
        </div>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "직속 팀", value: partners.length, unit: "명", color: "#d4af37" },
          { label: "보유금 합", value: fmtMoney(totalBalance), unit: "원", color: "#34d399" },
          { label: "활성", value: partners.filter(p => p.is_active).length, unit: "명", color: "#60a5fa" },
        ].map(c => (
          <div key={c.label} className="glass-card-sm p-4 space-y-1.5">
            <p className="text-[9px] font-medium uppercase tracking-widest text-slate-600">{c.label}</p>
            <p className="text-xl font-bold tabular-nums" style={{ color: c.color }}>
              {c.value}
              <span className="ml-1 text-[10px] font-normal text-slate-600">{c.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {/* 컬럼 헤더 */}
      <div
        className="hidden sm:grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 rounded-xl px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600"
        style={{ background: "rgba(8,15,28,0.5)", border: "1px solid rgba(51,65,85,0.3)" }}
      >
        <span className="w-14">단계</span>
        <span>이름 · 아이디</span>
        <span className="text-right w-24">요율</span>
        <span className="text-right w-28">보유금</span>
        <span className="text-right w-60">관리</span>
      </div>

      {/* 팀 네트워크 목록 */}
      {rootQ.isLoading && (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="shimmer h-16 rounded-xl" />)}</div>
      )}

      {!rootQ.isLoading && (
        <div
          className="overflow-hidden rounded-2xl"
          style={{ background: "rgba(8,15,28,0.85)", border: "1px solid rgba(212,175,55,0.12)", backdropFilter: "blur(12px)" }}
        >
          {partners.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-3xl mb-3">▦</p>
              <p className="text-slate-600 text-sm mb-4">직속 팀원이 아직 없습니다</p>
              <button
                onClick={() => setModal({ type: "create", parentId: user?.id ?? 0, parentLogin: user?.login_id ?? "me" })}
                className="rounded-xl border border-premium/30 px-4 py-2 text-sm text-premium hover:bg-premium/10 transition-all"
              >
                계정 생성
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/50">
              {partners.map((p) => (
                <PartnerRow
                  key={`${p.id}-${treeEpoch}`}
                  partner={p}
                  depth={0}
                  token={token!}
                  base={base!}
                  onModal={onModal}
                  myId={user?.id ?? 0}
                  treeEpoch={treeEpoch}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 모달들 */}
      {modal?.type === "create" && (
        <CreateModal
          parentId={modal.parentId}
          parentLogin={modal.parentLogin}
          token={token!}
          base={base!}
          onClose={() => { setModal(null); qc.invalidateQueries({ queryKey: ["partners"] }); }}
        />
      )}
      {modal?.type === "rates" && (
        <RatesModal
          partner={modal.partner}
          token={token!}
          base={base!}
          onClose={() => setModal(null)}
        />
      )}
      {(modal?.type === "pay" || modal?.type === "collect") && (
        <MoneyModal
          type={modal.type}
          partner={modal.partner}
          token={token!}
          base={base!}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
