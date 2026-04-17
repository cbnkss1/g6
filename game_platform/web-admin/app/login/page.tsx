"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore, type SiteConfigState, type UserPublicState } from "@/store/useAuthStore";

type LoginJson = {
  access_token: string;
  user: UserPublicState;
  site: SiteConfigState;
};

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpRequired, setOtpRequired] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTestSeedHint, setShowTestSeedHint] = useState(false);
  const [sessionHint, setSessionHint] = useState<string | null>(null);

  useEffect(() => {
    setShowTestSeedHint(window.location.hostname === "test.slotpass.net");
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("reason") === "session") {
      setSessionHint(
        "세션이 만료되었거나 서버가 재시작되어 토큰이 무효화되었습니다. 다시 로그인해 주세요.",
      );
    }
  }, []);

  async function doLogin(otp?: string) {
    setErr(null);
    const base = publicApiBase();
    if (!base) {
      setErr("API 베이스(URL)가 설정되지 않았습니다.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${base}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login_id: loginId.trim(),
          password,
          otp_code: otp ?? undefined,
        }),
      });

      // 202 = OTP 입력 단계 필요
      if (r.status === 202) {
        setOtpRequired(true);
        setErr(null);
        return;
      }

      const data = (await r.json().catch(() => null)) as LoginJson | { detail?: string };
      if (!r.ok) {
        const msg =
          typeof (data as { detail?: string }).detail === "string"
            ? (data as { detail: string }).detail
            : "로그인에 실패했습니다.";
        setErr(msg);
        return;
      }
      const ok = data as LoginJson;
      const u = ok.user;
      setSession(ok.access_token, {
        ...u,
        is_store_enabled: Boolean(u.is_store_enabled),
        is_partner: Boolean(u.is_partner),
      }, ok.site);
      const nextRaw = new URLSearchParams(window.location.search).get("next");
      const dest =
        nextRaw && nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";
      router.replace(dest);
      router.refresh();
    } catch {
      setErr("네트워크 오류입니다.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (otpRequired) {
      doLogin(otpCode.trim());
    } else {
      doLogin();
    }
  }

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4"
      style={{
        background: "#060b14",
        backgroundImage: `
          radial-gradient(ellipse 120% 70% at 50% -10%, rgba(212,175,55,0.1), transparent),
          radial-gradient(ellipse 60% 50% at 100% 100%, rgba(14,30,60,0.6), transparent),
          radial-gradient(ellipse 40% 50% at 0% 60%, rgba(10,20,40,0.5), transparent)
        `,
      }}
    >
      {/* 배경 파티클 데코 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full opacity-5"
            style={{
              width: `${80 + i * 60}px`,
              height: `${80 + i * 60}px`,
              left: `${10 + i * 15}%`,
              top: `${10 + i * 14}%`,
              background: "radial-gradient(circle, rgba(212,175,55,0.8), transparent)",
              animation: `float ${4 + i}s ease-in-out ${i * 0.5}s infinite`,
            }}
          />
        ))}
      </div>

      <div
        className="relative w-full max-w-md p-8"
        style={{
          background: "rgba(8,15,28,0.85)",
          backdropFilter: "blur(24px)",
          borderRadius: "24px",
          border: "1px solid rgba(212,175,55,0.18)",
          boxShadow: "0 0 80px rgba(212,175,55,0.12), 0 32px 64px rgba(0,0,0,0.7), inset 0 1px 0 rgba(212,175,55,0.08)",
        }}
      >
        {/* 로고 */}
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{
              background: "linear-gradient(135deg, #d4af37, #8a7530)",
              boxShadow: "0 0 32px rgba(212,175,55,0.5)",
            }}
          >
            <span className="text-2xl font-bold text-slate-950">S</span>
          </div>
          <p className="text-premium-label">SLOTPASS Admin</p>
          <h1
            className="mt-1.5 text-3xl font-bold text-slate-100"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            {otpRequired ? "2단계 인증" : "운영자 로그인"}
          </h1>
          <p className="mt-1 text-xs text-slate-600">
            {otpRequired
              ? "Google Authenticator에서 6자리 코드를 입력하세요."
              : "iGaming B2B Platform · 권한별 접근 통제"}
          </p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          {!otpRequired ? (
            <>
              <div className="space-y-1">
                <label htmlFor="login_id" className="text-premium-label">아이디</label>
                <input
                  id="login_id"
                  name="login_id"
                  autoComplete="username"
                  className="admin-touch-input w-full rounded-2xl px-4 text-slate-100 outline-none transition-all placeholder:text-slate-700"
                  style={{
                    background: "rgba(12,20,36,0.8)",
                    border: "1px solid rgba(51,65,85,0.8)",
                  }}
                  placeholder="admin"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  onFocus={(e) => { e.target.style.borderColor = "rgba(212,175,55,0.4)"; e.target.style.boxShadow = "0 0 16px rgba(212,175,55,0.12)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "rgba(51,65,85,0.8)"; e.target.style.boxShadow = "none"; }}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="password" className="text-premium-label">비밀번호</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  className="admin-touch-input w-full rounded-2xl px-4 text-slate-100 outline-none transition-all placeholder:text-slate-700"
                  style={{
                    background: "rgba(12,20,36,0.8)",
                    border: "1px solid rgba(51,65,85,0.8)",
                  }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={(e) => { e.target.style.borderColor = "rgba(212,175,55,0.4)"; e.target.style.boxShadow = "0 0 16px rgba(212,175,55,0.12)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "rgba(51,65,85,0.8)"; e.target.style.boxShadow = "none"; }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-premium/20 bg-premium/8 px-4 py-3">
                <p className="font-semibold text-premium text-sm">🔐 Google OTP 인증 필요</p>
                <p className="mt-0.5 text-xs text-slate-500">{loginId} 계정의 2FA가 활성화되어 있습니다.</p>
              </div>
              <div className="space-y-1">
                <label htmlFor="otp_code" className="text-premium-label">OTP 코드</label>
                <input
                  id="otp_code"
                  name="otp_code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  autoComplete="one-time-code"
                  className="admin-touch-input w-full rounded-2xl px-4 text-center text-3xl font-bold tracking-[0.5em] text-premium outline-none transition-all placeholder:text-slate-700"
                  style={{
                    background: "rgba(12,20,36,0.8)",
                    border: "1px solid rgba(212,175,55,0.3)",
                    fontFamily: "monospace",
                  }}
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>
              <button
                type="button"
                onClick={() => { setOtpRequired(false); setOtpCode(""); setErr(null); }}
                className="text-xs text-slate-600 hover:text-premium transition-colors"
              >
                ← 처음으로 돌아가기
              </button>
            </>
          )}

          {sessionHint && !err && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 px-4 py-3 text-sm text-amber-200/90">
              {sessionHint}
            </div>
          )}

          {err && (
            <div className="rounded-xl border border-red-500/20 bg-red-950/20 px-4 py-3 text-sm text-red-400">
              ✕ {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (otpRequired && otpCode.length < 6)}
            className="admin-touch-btn w-full rounded-2xl text-base font-bold text-slate-950 transition-all hover:opacity-90 disabled:opacity-40"
            style={{
              background: "linear-gradient(135deg, #d4af37 0%, #f0e2a8 50%, #8a7530 100%)",
              boxShadow: "0 0 32px rgba(212,175,55,0.3), 0 4px 16px rgba(0,0,0,0.4)",
            }}
          >
            {loading ? "확인 중…" : otpRequired ? "OTP 인증" : "로그인 →"}
          </button>
        </form>

        {showTestSeedHint && (
          <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-600">
            테스트 시드 계정:{" "}
            <code className="rounded bg-slate-900/80 px-1.5 py-0.5 text-slate-400">superadmin</code> /{" "}
            <code className="rounded bg-slate-900/80 px-1.5 py-0.5 text-slate-400">SuperAdmin#2026</code>
            <br />
            <span className="text-slate-700">DB에 없으면 서버에서 </span>
            <code className="text-slate-600">python scripts/seed_multitenant_admin.py</code>
            <span className="text-slate-700"> 실행</span>
          </p>
        )}

        <p className="mt-6 text-center text-[10px] text-slate-700 tracking-widest">
          SLOTPASS · iGaming Solutions · v2.0
        </p>
      </div>
    </div>
  );
}
