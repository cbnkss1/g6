"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

export default function SettingsPage() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const base = publicApiBase();
  const headers = { Authorization: `Bearer ${token}` };
  const qc = useQueryClient();

  // OTP 상태
  const [otpStep, setOtpStep] = useState<"idle" | "setup" | "verify" | "disable">("idle");
  const [otpUri, setOtpUri] = useState("");
  const [otpSecret, setOtpSecret] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const { data: meData } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const r = await fetch(`${base}/admin/me`, { headers });
      return r.json();
    },
    enabled: !!token,
  });

  const otpEnabled = meData?.otp_enabled === true;

  const setupMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${base}/admin/otp/setup`, { method: "POST", headers });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (d) => {
      setOtpUri(d.provisioning_uri);
      setOtpSecret(d.secret);
      setOtpStep("verify");
    },
    onError: (e: Error) => setMsg({ type: "err", text: e.message }),
  });

  const enableMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${base}/admin/otp/verify-and-enable`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      setMsg({ type: "ok", text: "OTP 활성화 완료! 다음 로그인부터 OTP가 필요합니다." });
      setOtpStep("idle");
      setCode("");
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: Error) => setMsg({ type: "err", text: e.message }),
  });

  const disableMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${base}/admin/otp/disable`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      setMsg({ type: "ok", text: "OTP가 비활성화되었습니다." });
      setOtpStep("idle");
      setCode("");
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: Error) => setMsg({ type: "err", text: e.message }),
  });

  return (
    <div className="mx-auto max-w-lg space-y-5 animate-fade-up">
      <div>
        <p className="text-premium-label">계정 설정</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-100"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          보안 & 인증 관리
        </h1>
      </div>

      {/* 계정 정보 카드 */}
      <div className="glass-card flex items-center gap-4 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
          style={{
            background: "linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))",
            border: "1px solid rgba(212,175,55,0.2)",
          }}>
          👤
        </div>
        <div>
          <p className="text-premium-label">현재 계정</p>
          <p className="mt-0.5 text-xl font-bold text-slate-100">{user?.login_id}</p>
          <span className="mt-1 inline-block rounded-full bg-premium/12 border border-premium/25 px-2 py-0.5 text-[10px] font-semibold text-premium">
            {user?.role?.toUpperCase()}
          </span>
        </div>
      </div>

      {/* OTP 카드 */}
      <div className="glass-card space-y-5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-slate-100">Google OTP (2FA)</p>
            <p className="mt-0.5 text-xs text-slate-600">Google Authenticator 2단계 인증</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${
            otpEnabled
              ? "bg-emerald-500/12 border-emerald-500/30 text-emerald-300"
              : "bg-slate-800 border-slate-700 text-slate-500"
          }`}>
            {otpEnabled ? "● 활성" : "○ 비활성"}
          </span>
        </div>

        <div className="premium-divider" />

        {msg && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${
            msg.type === "ok"
              ? "border-emerald-500/20 bg-emerald-950/20 text-emerald-300"
              : "border-red-500/20 bg-red-950/20 text-red-400"
          }`}>
            {msg.type === "ok" ? "✓ " : "✕ "}{msg.text}
          </div>
        )}

        {otpStep === "idle" && !otpEnabled && (
          <button
            onClick={() => { setMsg(null); setupMut.mutate(); }}
            disabled={setupMut.isPending}
            className="admin-touch-btn w-full rounded-xl font-semibold text-slate-950 transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #d4af37, #f0e2a8, #8a7530)" }}
          >
            {setupMut.isPending ? "처리 중…" : "🔐 OTP 설정 시작"}
          </button>
        )}

        {otpStep === "idle" && otpEnabled && (
          <button
            onClick={() => { setMsg(null); setOtpStep("disable"); }}
            className="admin-touch-btn w-full rounded-xl border border-red-500/25 bg-red-950/20 text-sm font-semibold text-red-400 hover:bg-red-950/30 transition-all"
          >
            OTP 비활성화
          </button>
        )}

        {otpStep === "verify" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-premium/15 bg-slate-950/60 p-5 space-y-3 text-center">
              <p className="text-xs text-slate-500">Google Authenticator로 스캔하세요</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(otpUri)}&size=200x200&color=D4AF37&bgcolor=060B14`}
                alt="OTP QR Code"
                className="mx-auto rounded-2xl"
                style={{ boxShadow: "0 0 32px rgba(212,175,55,0.2)" }}
                width={180}
                height={180}
              />
              <p className="text-[10px] text-slate-700">
                시크릿: <code className="text-slate-500">{otpSecret}</code>
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-slate-500">앱의 6자리 코드 입력</p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="admin-touch-input w-full rounded-2xl border border-premium/30 bg-slate-950 px-4 text-center text-3xl font-bold tracking-[0.5em] text-premium outline-none focus:shadow-[0_0_20px_rgba(212,175,55,0.2)] transition-all"
                style={{ fontFamily: "monospace" }}
              />
            </div>
            <button
              onClick={() => { setMsg(null); enableMut.mutate(); }}
              disabled={enableMut.isPending || code.length < 6}
              className="admin-touch-btn w-full rounded-xl font-semibold text-slate-950 transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #d4af37, #f0e2a8, #8a7530)" }}
            >
              {enableMut.isPending ? "확인 중…" : "OTP 활성화 확인"}
            </button>
            <button onClick={() => { setOtpStep("idle"); setCode(""); }}
              className="w-full text-xs text-slate-600 hover:text-slate-400 transition-colors">
              취소
            </button>
          </div>
        )}

        {otpStep === "disable" && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">비활성화하려면 현재 OTP 코드를 입력하세요.</p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="admin-touch-input w-full rounded-2xl border border-red-500/30 bg-slate-950 px-4 text-center text-3xl font-bold tracking-[0.5em] text-red-400 outline-none transition-all"
              style={{ fontFamily: "monospace" }}
            />
            <button
              onClick={() => { setMsg(null); disableMut.mutate(); }}
              disabled={disableMut.isPending || code.length < 6}
              className="admin-touch-btn w-full rounded-xl font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)" }}
            >
              {disableMut.isPending ? "처리 중…" : "비활성화 확인"}
            </button>
            <button onClick={() => { setOtpStep("idle"); setCode(""); }}
              className="w-full text-xs text-slate-600 hover:text-slate-400">
              취소
            </button>
          </div>
        )}
      </div>

      <div className="glass-card-sm mt-6 space-y-3 p-5">
        <p className="text-sm font-medium text-slate-200">사이트 운영</p>
        <p className="text-xs text-slate-500">
          데모 ADM 스타일 설정은 아래로 이동합니다. (좁은 화면에서는 사이드 메뉴 대신 여기서 들어오세요.)
        </p>
        <ul className="space-y-2 text-sm">
          <li>
            <Link href="/settings/site-policy" className="text-premium hover:underline">
              사이트 운영 정책 (점검·충환·보너스 %) →
            </Link>
          </li>
          <li>
            <Link href="/settings/vendor-gates" className="text-premium hover:underline">
              게임사 제한 →
            </Link>
          </li>
          <li>
            <Link href="/settings/admin-ips" className="text-premium hover:underline">
              어드민 허용 IP →
            </Link>
          </li>
        </ul>
      </div>

      <div className="glass-card-sm mt-6 p-5">
        <p className="text-sm font-medium text-slate-200">사이트 배팅 한도</p>
        <p className="mt-1 text-xs text-slate-500">
          파워볼·스포츠·카지노·슬롯 최소·1회 최대 (총판/슈퍼 수정)
        </p>
        <Link
          href="/settings/bet-limits"
          className="mt-3 inline-block text-sm text-premium hover:underline"
        >
          배팅 한도 설정 →
        </Link>
      </div>
    </div>
  );
}
