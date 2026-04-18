"use client";

import { useEffect, useRef, useState } from "react";

import { playerChangePassword } from "@/lib/playerApi";

type Props = { token: string };

export function PlayerPasswordChangeSection({ token }: Props) {
  const [current, setCurrent] = useState("");
  const [nextPwd, setNextPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const go = () => {
      if (window.location.hash === "#password") {
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (nextPwd !== confirm) {
      setErr("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    if (nextPwd.length < 6) {
      setErr("새 비밀번호는 6자 이상으로 입력해 주세요.");
      return;
    }
    setLoading(true);
    try {
      await playerChangePassword(token, {
        current_password: current,
        new_password: nextPwd,
      });
      setMsg("비밀번호가 변경되었습니다.");
      setCurrent("");
      setNextPwd("");
      setConfirm("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "변경 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={sectionRef} id="password" className="glass-panel mb-6 scroll-mt-24 p-6">
      <h2 className="font-display text-lg font-bold uppercase tracking-wider text-slate-100">
        비밀번호 변경
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        로그인에 사용하는 비밀번호만 변경할 수 있습니다. (닉네임·계좌 등은 변경하지 않습니다.)
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        {msg ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            {msg}
          </p>
        ) : null}
        {err ? (
          <p className="rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {err}
          </p>
        ) : null}
        <label className="block text-xs font-medium text-slate-400">
          현재 비밀번호
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-quantum-cyan/50"
            required
          />
        </label>
        <label className="block text-xs font-medium text-slate-400">
          새 비밀번호 (6자 이상)
          <input
            type="password"
            autoComplete="new-password"
            value={nextPwd}
            onChange={(e) => setNextPwd(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-quantum-cyan/50"
            required
            minLength={6}
          />
        </label>
        <label className="block text-xs font-medium text-slate-400">
          새 비밀번호 확인
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-quantum-cyan/50"
            required
            minLength={6}
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg border border-quantum-cyan/50 bg-quantum-cyan/15 py-2.5 text-sm font-semibold text-quantum-cyan shadow-quantum-glow transition hover:bg-quantum-cyan/25 disabled:opacity-50 sm:w-auto sm:px-8"
        >
          {loading ? "처리 중…" : "비밀번호 변경"}
        </button>
      </form>
    </div>
  );
}
