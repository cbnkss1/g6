"use client";

import { useCallback, useEffect, useState } from "react";

import {
  playerSupportCreateTicket,
  playerSupportListTickets,
  playerSupportRecentBets,
  type SupportBetRow,
  type SupportTicketPublic,
} from "@/lib/playerApi";
import { publicApiBase } from "@/lib/publicApiBase";

const CATEGORIES: { value: string; label: string }[] = [
  { value: "CHARGE", label: "충전 문의" },
  { value: "WITHDRAW", label: "환전 문의" },
  { value: "GAME_VOID", label: "게임/적특 문의" },
  { value: "EVENT", label: "이벤트 문의" },
  { value: "OTHER", label: "기타" },
];

type Props = {
  token: string;
  onSubmitted?: () => void;
};

export function PlayerSupportCyberForm({ token, onSubmitted }: Props) {
  const [category, setCategory] = useState("CHARGE");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attachedIds, setAttachedIds] = useState<number[]>([]);
  const [tickets, setTickets] = useState<SupportTicketPublic[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [bets, setBets] = useState<SupportBetRow[]>([]);
  const [betLoading, setBetLoading] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());

  const loadTickets = useCallback(async () => {
    const d = await playerSupportListTickets(token);
    setTickets(d.items);
  }, [token]);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        await loadTickets();
      } catch {
        if (!c) setErr("문의 목록을 불러오지 못했습니다.");
      }
    })();
    return () => {
      c = true;
    };
  }, [loadTickets]);

  async function openBetModal() {
    setErr(null);
    setModalOpen(true);
    setBetLoading(true);
    setSel(new Set(attachedIds));
    try {
      const d = await playerSupportRecentBets(token, 40);
      setBets(d.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "배팅 내역 로드 실패");
      setBets([]);
    } finally {
      setBetLoading(false);
    }
  }

  function toggleBet(id: number) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function confirmBets() {
    const ids = Array.from(sel);
    setAttachedIds(ids);
    const lines = ids
      .map((id) => bets.find((b) => b.id === id))
      .filter(Boolean)
      .map((b) => `[첨부] ${b!.link_line} | ${b!.game_type} | 배팅 ${b!.bet_amount}`)
      .join("\n");
    if (lines) {
      setBody((prev) => (prev.trim() ? `${prev.trim()}\n\n${lines}` : lines));
    }
    setModalOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOkMsg(null);
    if (!title.trim() || !body.trim()) {
      setErr("제목과 내용을 입력해 주세요.");
      return;
    }
    setLoading(true);
    try {
      await playerSupportCreateTicket(token, {
        category,
        title: title.trim(),
        body: body.trim(),
        attached_bet_ids: attachedIds,
      });
      setOkMsg("문의가 접수되었습니다. 순차적으로 답변드립니다.");
      setTitle("");
      setBody("");
      setAttachedIds([]);
      await loadTickets();
      onSubmitted?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "접수 실패");
    } finally {
      setLoading(false);
    }
  }

  const base = publicApiBase();

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <section className="lg:col-span-3">
        <div
          className="rounded-2xl border border-cyan-500/25 bg-[#0f172a]/90 p-6 shadow-[0_0_40px_-12px_rgba(34,211,238,0.35)]"
          style={{ background: "linear-gradient(145deg, #0f172a 0%, #111827 100%)" }}
        >
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="bg-gradient-to-r from-cyan-300 via-emerald-300 to-amber-200 bg-clip-text text-xl font-bold text-transparent">
                1:1 문의 접수
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                SlotPass Support · 암호화된 세션:{" "}
                <span className="font-mono text-cyan-500/80">{base.replace(/^https?:\/\//, "").slice(0, 28)}…</span>
              </p>
            </div>
            <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-200">
              Live Queue
            </span>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-cyan-500/90">
                문의 유형
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-cyan-500/30 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none ring-cyan-500/40 focus:ring-2"
                required
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-cyan-500/90">
                제목
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="한 줄 요약"
                className="w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                required
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openBetModal}
                className="group relative overflow-hidden rounded-lg border border-cyan-400/50 bg-gradient-to-r from-cyan-500/20 to-emerald-500/15 px-4 py-2 text-sm font-semibold text-cyan-100 shadow-[0_0_20px_-6px_rgba(34,211,238,0.6)] transition hover:border-cyan-300/80 hover:shadow-[0_0_28px_-4px_rgba(34,211,238,0.75)]"
              >
                <span className="relative z-10">내 배팅 내역 불러오기</span>
                <span
                  className="absolute inset-0 opacity-0 transition group-hover:opacity-100"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(34,211,238,0.15), transparent)",
                  }}
                />
              </button>
              {attachedIds.length > 0 ? (
                <span className="text-xs text-emerald-400/90">
                  배팅 {attachedIds.length}건 첨부됨
                </span>
              ) : null}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-cyan-500/90">
                내용
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                placeholder="문의 내용을 상세히 적어 주세요. 배팅 첨부 시 자동으로 하단에 링크가 포함됩니다."
                className="w-full resize-y rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2.5 text-sm leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                required
              />
            </div>

            {err ? (
              <p className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">
                {err}
              </p>
            ) : null}
            {okMsg ? (
              <p className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
                {okMsg}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-500/25 via-amber-600/20 to-yellow-600/20 py-3 text-sm font-bold text-amber-100 shadow-[0_0_24px_-8px_rgba(251,191,36,0.5)] transition hover:border-amber-300/70 disabled:opacity-50"
            >
              {loading ? "전송 중…" : "문의 접수하기"}
            </button>
          </form>
        </div>
      </section>

      <aside className="lg:col-span-2">
        <div className="rounded-2xl border border-emerald-500/20 bg-[#111827]/95 p-5 shadow-[0_0_32px_-14px_rgba(16,185,129,0.35)]">
          <h3 className="text-sm font-semibold text-emerald-300/90">내 문의 현황</h3>
          <ul className="mt-3 max-h-[420px] space-y-2 overflow-y-auto text-xs">
            {tickets.length === 0 ? (
              <li className="text-slate-500">접수된 문의가 없습니다.</li>
            ) : (
              tickets.map((t) => (
                <li
                  key={t.id}
                  className="rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-slate-300"
                >
                  <div className="flex justify-between gap-2 text-[11px] text-slate-500">
                    <span>#{t.id}</span>
                    <span
                      className={
                        t.status === "ANSWERED" || t.status === "CLOSED"
                          ? "text-emerald-400"
                          : "text-amber-300"
                      }
                    >
                      {t.status}
                    </span>
                  </div>
                  <p className="mt-1 font-medium text-slate-200">{t.title}</p>
                  {t.admin_reply ? (
                    <p className="mt-1 line-clamp-2 text-slate-400">↳ {t.admin_reply}</p>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      </aside>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-500/40 shadow-[0_0_48px_-12px_rgba(34,211,238,0.45)]"
            style={{ background: "linear-gradient(180deg, #0f172a, #111827)" }}
          >
            <div className="border-b border-cyan-500/20 px-4 py-3">
              <h4 className="text-sm font-bold text-cyan-200">최근 배팅 선택</h4>
              <p className="text-[11px] text-slate-500">체크 후 확인을 누르면 본문에 첨부 링크가 삽입됩니다.</p>
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-3">
              {betLoading ? (
                <p className="py-8 text-center text-sm text-slate-500">불러오는 중…</p>
              ) : (
                <table className="w-full border-collapse text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-500">
                      <th className="py-2 pr-2">선택</th>
                      <th className="py-2 pr-2">ID</th>
                      <th className="py-2 pr-2">종목</th>
                      <th className="py-2 text-right">배팅</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bets.map((b) => (
                      <tr key={b.id} className="border-b border-slate-800/80 text-slate-300">
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            checked={sel.has(b.id)}
                            onChange={() => toggleBet(b.id)}
                            className="accent-cyan-400"
                          />
                        </td>
                        <td className="font-mono text-cyan-300/90">#{b.id}</td>
                        <td>{b.game_type}</td>
                        <td className="text-right tabular-nums">{b.bet_amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-700/80 px-4 py-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmBets}
                className="rounded-lg border border-emerald-500/50 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30"
              >
                본문에 첨부
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
