"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { CasinoMoneyTransferPanel } from "@/components/CasinoMoneyTransferPanel";
import { RollingPointConvertPanel } from "@/components/RollingPointConvertPanel";
import { SiteHeader } from "@/components/SiteHeader";
import { usePlayerAuth } from "@/lib/playerAuthContext";
import {
  playerCreateCashRequest,
  playerDeleteAllCashRequests,
  playerDeleteCashRequest,
  playerListCashRequests,
  type CashRequestPublic,
} from "@/lib/playerApi";
import { formatPlayerMoney } from "@/lib/formatPlayerMoney";
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
  /** 입출금 삭제 중 */
  const [cashDel, setCashDel] = useState<number | "all" | null>(null);

  /** 처리중(PROCESSING)만 삭제 불가 — 승인·거절·대기는 내역에서 제거 가능 */
  const cashRowDeletable = (status: string) => status !== "PROCESSING";

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

  async function onDeleteCashRow(id: number) {
    if (!window.confirm("이 신청 내역을 삭제할까요?")) return;
    setListErr(null);
    setCashDel(id);
    try {
      await playerDeleteCashRequest(token!, id);
      await loadList();
    } catch (e) {
      setListErr(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setCashDel(null);
    }
  }

  async function onDeleteAllCashRows() {
    if (
      !window.confirm(
        "목록에 보이는 신청을 모두 삭제합니다. (처리 중인 건만 제외) 계속할까요?",
      )
    )
      return;
    setListErr(null);
    setCashDel("all");
    try {
      await playerDeleteAllCashRequests(token!);
      await loadList();
    } catch (e) {
      setListErr(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setCashDel(null);
    }
  }

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
                  {formatPlayerMoney(user.game_money_balance)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  롤링 포인트
                </p>
                <p className="mt-1 font-mono text-lg text-slate-300">
                  {formatPlayerMoney(user.rolling_point_balance)}
                </p>
              </div>
            </div>

            <RollingPointConvertPanel
              token={token}
              hydrated={hydrated}
              loggedIn={Boolean(user && token)}
              rollingBalance={user?.rolling_point_balance}
              onOpenLogin={openLogin}
              onAfterConvert={async () => {
                await refreshProfile();
              }}
            />

            <CasinoMoneyTransferPanel
              token={token}
              hydrated={hydrated}
              loggedIn={Boolean(user && token)}
              onOpenLogin={openLogin}
              onAfterTransfer={async () => {
                await refreshProfile();
              }}
            />

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
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-300">내 신청 내역</h2>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {items.some((r) => cashRowDeletable(r.status)) ? (
                    <button
                      type="button"
                      disabled={cashDel !== null}
                      onClick={() => void onDeleteAllCashRows()}
                      className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-rose-100 shadow-[0_0_14px_-4px_rgba(244,63,94,0.45)] transition hover:border-rose-400/65 hover:bg-rose-900/55 disabled:opacity-40"
                    >
                      {cashDel === "all" ? "삭제 중…" : "전체 삭제"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void loadList()}
                    className="text-[11px] text-slate-500 hover:text-premium-glow"
                  >
                    새로고침
                  </button>
                </div>
              </div>
              {listErr && <p className="text-sm text-amber-400">{listErr}</p>}
              {!listErr && items.length === 0 && (
                <p className="text-sm text-slate-500">아직 신청 내역이 없습니다.</p>
              )}
              <ul className="mt-2 max-h-64 divide-y divide-white/5 overflow-y-auto text-sm">
                {items.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                  >
                    <span className="text-slate-400">
                      {row.request_type === "DEPOSIT" ? "입금" : "출금"}{" "}
                      <span className="font-mono text-slate-200">{row.amount}</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={
                          row.status === "PENDING"
                            ? "text-amber-400"
                            : row.status === "APPROVED"
                              ? "text-emerald-400"
                              : row.status === "REJECTED"
                                ? "text-rose-400"
                                : "text-slate-500"
                        }
                      >
                        {row.status}
                      </span>
                      {cashRowDeletable(row.status) ? (
                        <button
                          type="button"
                          title="이 신청 삭제"
                          disabled={cashDel !== null}
                          onClick={() => void onDeleteCashRow(row.id)}
                          className="rounded-md border border-rose-500/35 bg-black/25 px-2 py-0.5 text-[10px] font-semibold text-rose-200/95 transition hover:border-rose-400/55 hover:bg-rose-950/40 disabled:opacity-40"
                        >
                          {cashDel === row.id ? "…" : "삭제"}
                        </button>
                      ) : null}
                    </div>
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
