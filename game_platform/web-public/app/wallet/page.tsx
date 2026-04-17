"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { SiteHeader } from "@/components/SiteHeader";
import { usePlayerAuth } from "@/lib/playerAuthContext";
import {
  playerCreateCashRequest,
  playerListCashRequests,
  type CashRequestPublic,
} from "@/lib/playerApi";
import { playerAdminWebUrl, playerMemoUrl, playerSupportUrl } from "@/lib/playerExternalLinks";

export default function WalletPage() {
  const { token, user, hydrated, openLogin, refreshProfile } = usePlayerAuth();
  const [tab, setTab] = useState<"DEPOSIT" | "WITHDRAW">("DEPOSIT");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [withdrawPassword, setWithdrawPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [items, setItems] = useState<CashRequestPublic[]>([]);
  const [listErr, setListErr] = useState<string | null>(null);

  const supportUrl = playerSupportUrl();
  const memoUrl = playerMemoUrl();
  const adminUrl = playerAdminWebUrl();

  const loadList = useCallback(async () => {
    if (!token) return;
    setListErr(null);
    try {
      const r = await playerListCashRequests(token);
      setItems(r.items);
    } catch (e) {
      setListErr(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    }
  }, [token]);

  useEffect(() => {
    if (hydrated && token) void loadList();
  }, [hydrated, token, loadList]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!token) {
      openLogin();
      return;
    }
    setBusy(true);
    try {
      await playerCreateCashRequest(token, {
        request_type: tab,
        amount: amount.trim(),
        memo: memo.trim() || undefined,
        withdraw_password: tab === "WITHDRAW" ? withdrawPassword || undefined : undefined,
      });
      setAmount("");
      setMemo("");
      setWithdrawPassword("");
      setMsg("신청이 접수되었습니다. 관리자 확인 후 처리됩니다.");
      await loadList();
      await refreshProfile();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "신청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#060b14] text-slate-200">
      <SiteHeader />
      <main className="mx-auto w-full max-w-lg flex-1 space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">입출금</h1>
          <p className="mt-1 text-sm text-slate-500">
            입금·출금 신청은 관리자 승인 후 반영됩니다. 긴급 문의는 고객센터를 이용해 주세요.
          </p>
        </div>

        {!hydrated ? (
          <p className="text-sm text-slate-500">불러오는 중…</p>
        ) : !user || !token ? (
          <div className="glass-panel space-y-3 p-5">
            <p className="text-sm text-slate-400">로그인 후 이용할 수 있습니다.</p>
            <button
              type="button"
              onClick={() => openLogin()}
              className="rounded-lg bg-gradient-to-r from-emerald-400 to-green-500 px-4 py-2 text-sm font-semibold text-slate-950"
            >
              로그인
            </button>
          </div>
        ) : (
          <>
            <div className="glass-panel grid grid-cols-2 gap-3 p-4 text-sm">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  게임머니
                </p>
                <p className="mt-1 font-mono text-lg text-premium-glow">
                  {user.game_money_balance ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  롤링 포인트
                </p>
                <p className="mt-1 font-mono text-lg text-slate-300">
                  {user.rolling_point_balance ?? "—"}
                </p>
              </div>
            </div>

            <div className="glass-panel space-y-4 p-5">
              <h2 className="text-sm font-semibold text-slate-300">카지노머니 전환</h2>
              <p className="text-sm leading-relaxed text-slate-500">
                카지노 지갑과 게임머니 간 전환은 별도 연동이 필요합니다.{" "}
                {supportUrl ? (
                  <a
                    href={supportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-premium-glow underline decoration-premium/40 underline-offset-2 hover:text-premium"
                  >
                    고객센터로 문의
                  </a>
                ) : (
                  "상단 고객센터 링크(환경변수 설정 시) 또는 운영팀으로 문의해 주세요."
                )}
              </p>
            </div>

            <div className="glass-panel p-5">
              <div className="mb-4 flex rounded-lg border border-white/10 p-0.5">
                <button
                  type="button"
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
                    tab === "DEPOSIT"
                      ? "bg-premium/20 text-premium-glow"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                  onClick={() => setTab("DEPOSIT")}
                >
                  입금 신청
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
                    tab === "WITHDRAW"
                      ? "bg-premium/20 text-premium-glow"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                  onClick={() => setTab("WITHDRAW")}
                >
                  출금 신청
                </button>
              </div>
              <form onSubmit={onSubmit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    금액
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-premium/40"
                    placeholder="0"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    메모 (선택)
                  </label>
                  <input
                    type="text"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-premium/40"
                    placeholder="입금자명·계좌 요청 등"
                  />
                </div>
                {tab === "WITHDRAW" && (
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      출금 비밀번호
                    </label>
                    <input
                      type="password"
                      value={withdrawPassword}
                      onChange={(e) => setWithdrawPassword(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-premium/40"
                      placeholder="가입 시 설정한 출금 비밀번호"
                      autoComplete="current-password"
                    />
                  </div>
                )}
                {msg && (
                  <p
                    className={`text-sm ${msg.startsWith("신청이") ? "text-emerald-400" : "text-amber-400"}`}
                  >
                    {msg}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-lg border border-premium/35 bg-premium/15 py-2.5 text-sm font-semibold text-premium-glow hover:bg-premium/25 disabled:opacity-50"
                >
                  {busy ? "처리 중…" : tab === "DEPOSIT" ? "입금 신청" : "출금 신청"}
                </button>
              </form>
            </div>

            <div className="glass-panel overflow-hidden p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-300">내 신청 내역</h2>
                <button
                  type="button"
                  onClick={() => void loadList()}
                  className="text-[11px] text-slate-500 hover:text-premium-glow"
                >
                  새로고침
                </button>
              </div>
              {listErr && <p className="text-sm text-amber-400">{listErr}</p>}
              {!listErr && items.length === 0 && (
                <p className="text-sm text-slate-500">아직 신청 내역이 없습니다.</p>
              )}
              <ul className="mt-2 max-h-64 divide-y divide-white/5 overflow-y-auto text-sm">
                {items.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <span className="text-slate-400">
                      {row.request_type === "DEPOSIT" ? "입금" : "출금"}{" "}
                      <span className="font-mono text-slate-200">{row.amount}</span>
                    </span>
                    <span
                      className={
                        row.status === "PENDING"
                          ? "text-amber-400"
                          : row.status === "APPROVED"
                            ? "text-emerald-400"
                            : "text-slate-500"
                      }
                    >
                      {row.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/" className="text-slate-500 hover:text-premium-glow">
            ← 홈
          </Link>
          {supportUrl && (
            <a
              href={supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-premium-glow"
            >
              고객센터
            </a>
          )}
          {memoUrl && (
            <a
              href={memoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-premium-glow"
            >
              쪽지
            </a>
          )}
          {adminUrl && (
            <a
              href={adminUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-premium-glow"
            >
              관리자
            </a>
          )}
        </div>
      </main>
    </div>
  );
}
