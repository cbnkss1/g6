"use client";

import { useCallback, useState } from "react";

import { usePlayerAuth } from "@/lib/playerAuthContext";
import {
  playerRegisterAnonymous,
  playerRegisterGeneral,
  playerLogin,
  type LoginResponse,
  type PlayerRegisterResult,
} from "@/lib/playerApi";

const MINT = "from-emerald-400 to-green-500";
const INPUT =
  "w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30";
const LABEL = "mb-1 block text-xs font-medium text-slate-400";

const BANKS = [
  "은행 선택",
  "국민",
  "신한",
  "우리",
  "하나",
  "농협",
  "기업",
  "카카오뱅크",
  "토스뱅크",
  "새마을",
  "우체국",
  "SC제일",
  "대구",
  "부산",
  "경남",
  "광주",
  "전북",
  "제주",
  "수협",
  "케이뱅크",
] as const;

const CARRIERS = ["SKT", "KT", "LGU+", "알뜰폰"] as const;

function defaultSiteId(): string | undefined {
  const v = process.env.NEXT_PUBLIC_DEFAULT_SITE_ID?.trim();
  return v || undefined;
}

export function PlayerAuthModals() {
  const { authMode, closeAuth, applySession, openRegister, openLogin } = usePlayerAuth();

  const [regTab, setRegTab] = useState<"general" | "anonymous">("general");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [loginId, setLoginId] = useState("");
  const [loginPw, setLoginPw] = useState("");

  const [signupCode, setSignupCode] = useState("");
  const [rid, setRid] = useState("");
  const [nickname, setNickname] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [holder, setHolder] = useState("");
  const [withdrawPw, setWithdrawPw] = useState("");
  const [carrier, setCarrier] = useState("SKT");
  const [phoneMid, setPhoneMid] = useState("");
  const [phoneLast, setPhoneLast] = useState("");
  const [birth, setBirth] = useState("");
  const [gender, setGender] = useState<"남성" | "여성">("남성");
  const [telegram, setTelegram] = useState("");

  const resetRegister = useCallback(() => {
    setErr(null);
    setSignupCode("");
    setRid("");
    setNickname("");
    setPw("");
    setPw2("");
    setBankName("");
    setBankAccount("");
    setHolder("");
    setWithdrawPw("");
    setCarrier("SKT");
    setPhoneMid("");
    setPhoneLast("");
    setBirth("");
    setGender("남성");
    setTelegram("");
  }, []);

  const buildPayload = useCallback(() => {
    const phone = `010${phoneMid.replace(/\D/g, "")}${phoneLast.replace(/\D/g, "")}`;
    const site_id = defaultSiteId();
    const base = {
      nickname: nickname.trim(),
      signup_code: signupCode.trim() || undefined,
      bank_name: bankName,
      bank_account: bankAccount.replace(/\s/g, ""),
      account_holder: holder.trim(),
      withdraw_password: withdrawPw,
      telecom_carrier: carrier,
      phone,
      birth_ymd: birth.replace(/\D/g, ""),
      gender,
      telegram_id: telegram.replace(/^@/, "").trim() || undefined,
      ...(site_id ? { site_id } : {}),
    };
    return { ...base, password: pw };
  }, [
    nickname,
    signupCode,
    bankName,
    bankAccount,
    holder,
    withdrawPw,
    carrier,
    phoneMid,
    phoneLast,
    birth,
    gender,
    telegram,
    pw,
  ]);

  async function onSubmitLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const id = loginId.trim();
    if (!id || !loginPw) {
      setErr("아이디와 비밀번호를 입력해 주세요.");
      return;
    }
    setLoading(true);
    try {
      const res = await playerLogin(id, loginPw);
      applySession(res);
      closeAuth();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "로그인 실패");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitRegister(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 6) {
      setErr("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (pw !== pw2) {
      setErr("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    if (!bankName || bankName === "은행 선택") {
      setErr("은행을 선택해 주세요.");
      return;
    }
    const digits = birth.replace(/\D/g, "");
    if (digits.length !== 8) {
      setErr("생년월일 8자리(YYYYMMDD)를 입력해 주세요.");
      return;
    }
    const mid = phoneMid.replace(/\D/g, "");
    const last = phoneLast.replace(/\D/g, "");
    if (mid.length < 3 || last.length < 4) {
      setErr("전화번호를 올바르게 입력해 주세요.");
      return;
    }

    setLoading(true);
    try {
      let res: PlayerRegisterResult;
      if (regTab === "general") {
        const id = rid.trim();
        if (id.length < 3) {
          setErr("아이디는 3자 이상이어야 합니다.");
          setLoading(false);
          return;
        }
        res = await playerRegisterGeneral({
          ...buildPayload(),
          login_id: id,
        });
      } else {
        res = await playerRegisterAnonymous(buildPayload());
      }
      applySession(res);
      closeAuth();
      resetRegister();
      if (res.assigned_login_id) {
        window.alert(
          `발급된 아이디: ${res.assigned_login_id}\n다음 로그인 시 이 아이디를 사용해 주세요.`,
        );
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "가입 실패");
    } finally {
      setLoading(false);
    }
  }

  if (authMode === "closed") return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) closeAuth();
      }}
    >
      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#252525] p-5 shadow-2xl shadow-black/60 sm:p-6">
        <button
          type="button"
          className="absolute right-3 top-3 rounded-lg p-1 text-slate-500 hover:bg-white/5 hover:text-slate-300"
          onClick={closeAuth}
          aria-label="닫기"
        >
          ✕
        </button>

        {authMode === "login" ? (
          <>
            <div className="mb-5 text-center">
              <p className="font-display text-lg font-semibold text-emerald-400">SLOTPASS</p>
              <h2 className="mt-1 text-xl font-bold text-white">로그인</h2>
              <p className="mt-1 text-xs text-slate-500">방문을 환영합니다.</p>
            </div>
            <form onSubmit={onSubmitLogin} className="space-y-4">
              <div>
                <label className={LABEL}>아이디</label>
                <input
                  className={INPUT}
                  placeholder="아이디를 입력해주세요"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  autoComplete="username"
                />
              </div>
              <div>
                <label className={LABEL}>비밀번호</label>
                <input
                  className={INPUT}
                  type="password"
                  placeholder="비밀번호를 입력해주세요"
                  value={loginPw}
                  onChange={(e) => setLoginPw(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              {err ? (
                <p
                  role="alert"
                  aria-live="assertive"
                  className="rounded-lg border border-red-500/50 bg-red-950/50 px-3 py-2.5 text-center text-sm font-medium text-red-200"
                >
                  {err}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={loading}
                className={`w-full rounded-xl bg-gradient-to-r ${MINT} py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 disabled:opacity-50`}
              >
                {loading ? "처리 중…" : "로그인"}
              </button>
            </form>
            <button
              type="button"
              className="mt-3 w-full rounded-xl border border-white/10 bg-slate-900/50 py-2.5 text-sm text-slate-300 hover:border-emerald-500/30"
              onClick={() => {
                setErr(null);
                openRegister();
                resetRegister();
              }}
            >
              회원이 아니신가요?
            </button>
            <p className="mt-4 text-center text-[11px] text-slate-600">
              비밀번호 분실 시 고객센터로 문의해 주세요.
            </p>
            <button
              type="button"
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-900/40 py-2.5 text-sm text-slate-400 hover:border-sky-500/30 hover:text-slate-200"
              onClick={() => window.alert("텔레그램 로그인은 준비 중입니다.")}
            >
              <span>Telegram 로그인</span>
            </button>
          </>
        ) : (
          <>
            <div className="mb-4 text-center">
              <p className="font-display text-lg font-semibold text-emerald-400">SLOTPASS</p>
              <h2 className="mt-1 text-xl font-bold text-white">환영합니다</h2>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`rounded-xl py-2.5 text-sm font-medium transition ${
                  regTab === "general"
                    ? `bg-gradient-to-r ${MINT} text-slate-950`
                    : "border border-white/10 bg-slate-900/40 text-slate-400"
                }`}
                onClick={() => {
                  setRegTab("general");
                  setErr(null);
                }}
              >
                일반 회원가입
              </button>
              <button
                type="button"
                className={`rounded-xl py-2.5 text-sm font-medium transition ${
                  regTab === "anonymous"
                    ? `bg-gradient-to-r ${MINT} text-slate-950`
                    : "border border-white/10 bg-slate-900/40 text-slate-400"
                }`}
                onClick={() => {
                  setRegTab("anonymous");
                  setErr(null);
                }}
              >
                무기명 회원가입
              </button>
            </div>

            <form onSubmit={onSubmitRegister} className="space-y-3">
              {regTab === "general" && (
                <>
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-[11px] leading-relaxed text-emerald-200/90">
                    가입코드가 없으시다면 <strong>VVIP</strong> 없이 비워 두시거나, 추천인 아이디를 입력해
                    주세요.
                  </div>
                  <div>
                    <label className={LABEL}>가입코드 (추천인 아이디)</label>
                    <input
                      className={INPUT}
                      placeholder="가입코드를 입력해주세요"
                      value={signupCode}
                      onChange={(e) => setSignupCode(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>아이디</label>
                    <input
                      className={INPUT}
                      placeholder="아이디를 입력하세요"
                      value={rid}
                      onChange={(e) => setRid(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </>
              )}
              {regTab === "anonymous" && (
                <>
                  <div className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-500">
                    무기명 가입 시 아이디는 자동 발급됩니다. 가입 완료 후 안내창을 확인해 주세요.
                  </div>
                  <div>
                    <label className={LABEL}>가입코드 (선택)</label>
                    <input
                      className={INPUT}
                      placeholder="추천인 아이디"
                      value={signupCode}
                      onChange={(e) => setSignupCode(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div>
                <label className={LABEL}>닉네임</label>
                <input
                  className={INPUT}
                  placeholder="닉네임을 입력하세요"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL}>비밀번호</label>
                <input
                  className={INPUT}
                  type="password"
                  placeholder="비밀번호를 입력하세요"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className={LABEL}>비밀번호 확인</label>
                <input
                  className={INPUT}
                  type="password"
                  placeholder="비밀번호를 입력하세요"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <div className="grid grid-cols-5 gap-2">
                <div className="col-span-2">
                  <label className={LABEL}>은행</label>
                  <select
                    className={INPUT}
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                  >
                    {BANKS.map((b) => (
                      <option key={b} value={b === "은행 선택" ? "" : b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3">
                  <label className={LABEL}>계좌번호</label>
                  <input
                    className={INPUT}
                    placeholder="계좌번호"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className={LABEL}>예금주</label>
                <input
                  className={INPUT}
                  placeholder="예금주 이름을 입력해주세요"
                  value={holder}
                  onChange={(e) => setHolder(e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL}>입출금 비밀번호</label>
                <input
                  className={INPUT}
                  type="password"
                  placeholder="환전 비밀번호를 입력하세요"
                  value={withdrawPw}
                  onChange={(e) => setWithdrawPw(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className={LABEL}>통신사</label>
                <div className="flex flex-wrap gap-2">
                  {CARRIERS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                        carrier === c
                          ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/50"
                          : "border border-white/10 bg-slate-950/50 text-slate-400"
                      }`}
                      onClick={() => setCarrier(c)}
                    >
                      {carrier === c ? "✓ " : ""}
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={LABEL}>전화번호</label>
                <div className="flex gap-2">
                  <input className={`${INPUT} w-16 shrink-0`} readOnly value="010" />
                  <input
                    className={INPUT}
                    placeholder="0000"
                    inputMode="numeric"
                    value={phoneMid}
                    onChange={(e) => setPhoneMid(e.target.value)}
                    maxLength={4}
                  />
                  <input
                    className={INPUT}
                    placeholder="0000"
                    inputMode="numeric"
                    value={phoneLast}
                    onChange={(e) => setPhoneLast(e.target.value)}
                    maxLength={4}
                  />
                </div>
              </div>

              <div>
                <label className={LABEL}>생년월일</label>
                <input
                  className={INPUT}
                  placeholder="YYYYMMDD (예: 19930505)"
                  inputMode="numeric"
                  value={birth}
                  onChange={(e) => setBirth(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  maxLength={8}
                />
              </div>

              <div>
                <label className={LABEL}>성별</label>
                <div className="flex gap-2">
                  {(["남성", "여성"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`rounded-lg px-4 py-2 text-xs font-medium ${
                        gender === g
                          ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/50"
                          : "border border-white/10 bg-slate-950/50 text-slate-400"
                      }`}
                      onClick={() => setGender(g)}
                    >
                      {gender === g ? "✓ " : ""}
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={LABEL}>텔레그램 아이디 (선택)</label>
                <input
                  className={INPUT}
                  placeholder="@ 없이 입력 (예: username)"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                />
              </div>

              {err ? (
                <p
                  role="alert"
                  aria-live="assertive"
                  className="rounded-lg border border-red-500/50 bg-red-950/50 px-3 py-2.5 text-center text-sm font-medium text-red-200"
                >
                  {err}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className={`w-full rounded-xl bg-gradient-to-r ${MINT} py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 disabled:opacity-50`}
              >
                {loading ? "처리 중…" : "가입하기"}
              </button>
            </form>

            <button
              type="button"
              className="mt-3 w-full text-center text-xs text-slate-500 hover:text-emerald-400/90"
              onClick={() => {
                setErr(null);
                openLogin();
              }}
            >
              이미 계정이 있으신가요? 로그인
            </button>
          </>
        )}
      </div>
    </div>
  );
}
