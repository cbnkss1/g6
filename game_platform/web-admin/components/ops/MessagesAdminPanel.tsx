"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type OutboxRow = {
  id: number;
  to_login_id: string;
  title: string;
  body_preview: string;
  created_at: string | null;
  is_important?: boolean;
};

export function MessagesAdminPanel() {
  const token = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);
  const isSuper = authUser?.role === "super_admin";

  const [loginId, setLoginId] = useState("");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [msgImportant, setMsgImportant] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [sendOk, setSendOk] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<OutboxRow[]>([]);

  const [bcTitle, setBcTitle] = useState("");
  const [bcBody, setBcBody] = useState("");
  const [bcImportant, setBcImportant] = useState(false);
  const [bcSiteId, setBcSiteId] = useState("");
  const [bcConfirm, setBcConfirm] = useState(false);
  const [bcBusy, setBcBusy] = useState(false);
  const [bcErr, setBcErr] = useState<string | null>(null);
  const [bcOk, setBcOk] = useState<string | null>(null);

  const base = publicApiBase();

  const loadOutbox = useCallback(async () => {
    if (!base || !token) return;
    const r = await adminFetch(`${base}/admin/player-notifications/outbox?limit=40`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!r.ok) return;
    const d = (await r.json()) as { items: OutboxRow[] };
    setOutbox(d.items ?? []);
  }, [base, token]);

  useEffect(() => {
    void loadOutbox();
  }, [loadOutbox]);

  async function onSendMessage(e: React.FormEvent) {
    e.preventDefault();
    setSendErr(null);
    setSendOk(null);
    if (!base || !token) return;
    setSendBusy(true);
    try {
      const r = await adminFetch(`${base}/admin/player-notifications/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          login_id: loginId.trim(),
          title: msgTitle.trim(),
          body: msgBody.trim(),
          is_important: msgImportant,
        }),
      });
      const raw = await r.text();
      if (!r.ok) throw new Error(raw || `HTTP ${r.status}`);
      setSendOk("발송했습니다. 플레이어 쪽지함에서 확인할 수 있습니다.");
      setMsgTitle("");
      setMsgBody("");
      setMsgImportant(false);
      void loadOutbox();
    } catch (err) {
      setSendErr(err instanceof Error ? err.message : "실패");
    } finally {
      setSendBusy(false);
    }
  }

  async function onBroadcast(e: React.FormEvent) {
    e.preventDefault();
    setBcErr(null);
    setBcOk(null);
    if (!bcConfirm) {
      setBcErr("「전체 발송 확인」에 체크해야 합니다.");
      return;
    }
    if (!base || !token) return;
    setBcBusy(true);
    try {
      const payload: Record<string, string | boolean> = {
        title: bcTitle.trim(),
        body: bcBody.trim(),
        is_important: bcImportant,
      };
      if (isSuper && bcSiteId.trim()) payload.site_id = bcSiteId.trim();
      const r = await adminFetch(`${base}/admin/player-notifications/send-broadcast`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const raw = await r.text();
      if (!r.ok) throw new Error(raw || `HTTP ${r.status}`);
      let sent = 0;
      try {
        sent = Number((JSON.parse(raw) as { sent?: number }).sent ?? 0);
      } catch {
        /* ignore */
      }
      setBcOk(`일괄 발송 완료: ${sent}명에게 전달되었습니다.`);
      setBcTitle("");
      setBcBody("");
      setBcImportant(false);
      setBcConfirm(false);
      void loadOutbox();
    } catch (err) {
      setBcErr(err instanceof Error ? err.message : "실패");
    } finally {
      setBcBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="quantum-card space-y-4 p-5 sm:p-6">
        <div>
          <h3 className="text-base font-semibold text-slate-100">개별 회원에게 보내기</h3>
          <p className="mt-1 text-sm text-slate-500">
            플레이어 로그인 ID 한 명을 지정해 쪽지를 보냅니다. 플레이어 웹{" "}
            <span className="font-mono text-sky-300/90">/messages</span>에서 확인합니다.{" "}
            <span className="text-amber-200/85">중요 쪽지</span>는 읽기 전까지 스포츠·카지노·슬롯·미니게임 진입이
            차단됩니다.
          </p>
        </div>
        <form onSubmit={onSendMessage} className="grid max-w-xl gap-3">
          <label className="quantum-label">
            플레이어 로그인 ID
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className="quantum-input mt-1.5"
              required
              placeholder="예: player01"
              autoComplete="off"
            />
          </label>
          <label className="quantum-label">
            제목
            <input
              value={msgTitle}
              onChange={(e) => setMsgTitle(e.target.value)}
              className="quantum-input mt-1.5"
              required
              maxLength={200}
            />
          </label>
          <label className="quantum-label">
            내용
            <textarea
              value={msgBody}
              onChange={(e) => setMsgBody(e.target.value)}
              rows={5}
              className="quantum-input mt-1.5 min-h-[120px] resize-y"
              required
            />
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={msgImportant}
              onChange={(e) => setMsgImportant(e.target.checked)}
              className="mt-1 rounded border-slate-600"
            />
            <span>
              <strong className="text-amber-200/90">중요 쪽지</strong> — 미열람 시 해당 회원은 게임(배당·카지노·슬롯·미니) 화면
              진입 불가
            </span>
          </label>
          {sendErr ? <p className="text-sm text-rose-400">{sendErr}</p> : null}
          {sendOk ? <p className="text-sm text-emerald-400">{sendOk}</p> : null}
          <button
            type="submit"
            disabled={sendBusy || !token}
            className="w-fit rounded-xl border border-sky-500/40 bg-sky-500/15 px-5 py-2.5 text-sm font-medium text-sky-100 hover:bg-sky-500/25 disabled:opacity-40"
          >
            {sendBusy ? "보내는 중…" : "쪽지 발송"}
          </button>
        </form>
      </section>

      <section className="quantum-card space-y-4 border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] to-transparent p-5 sm:p-6">
        <div>
          <h3 className="text-base font-semibold text-amber-100/95">전체 회원(플레이어) 일괄 발송</h3>
          <p className="mt-1 text-sm text-slate-500">
            <strong className="text-slate-400">같은 사이트</strong>에 속한 모든 플레이어 계정에 동일 제목·본문으로 발송합니다. 운영 공지용으로
            사용하세요.
          </p>
        </div>
        <form onSubmit={onBroadcast} className="grid max-w-xl gap-3">
          {isSuper ? (
            <label className="quantum-label">
              site_id (선택 — 비우면 본인 소속 사이트)
              <input
                value={bcSiteId}
                onChange={(e) => setBcSiteId(e.target.value)}
                className="quantum-input mt-1.5 font-mono text-xs"
                placeholder="UUID"
                autoComplete="off"
              />
            </label>
          ) : null}
          <label className="quantum-label">
            제목
            <input
              value={bcTitle}
              onChange={(e) => setBcTitle(e.target.value)}
              className="quantum-input mt-1.5"
              required
              maxLength={200}
            />
          </label>
          <label className="quantum-label">
            내용
            <textarea
              value={bcBody}
              onChange={(e) => setBcBody(e.target.value)}
              rows={5}
              className="quantum-input mt-1.5 min-h-[120px] resize-y"
              required
            />
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={bcImportant}
              onChange={(e) => setBcImportant(e.target.checked)}
              className="mt-1 rounded border-slate-600"
            />
            <span>
              <strong className="text-amber-200/90">중요 쪽지</strong>로 일괄 발송 (미열람 회원 게임 진입 차단)
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={bcConfirm}
              onChange={(e) => setBcConfirm(e.target.checked)}
              className="mt-1 rounded border-slate-600"
            />
            <span>전체 플레이어에게 발송함을 확인했습니다. (실수 방지)</span>
          </label>
          {bcErr ? <p className="text-sm text-rose-400">{bcErr}</p> : null}
          {bcOk ? <p className="text-sm text-emerald-400">{bcOk}</p> : null}
          <button
            type="submit"
            disabled={bcBusy || !token}
            className="w-fit rounded-xl border border-amber-500/45 bg-amber-500/15 px-5 py-2.5 text-sm font-semibold text-amber-100 hover:bg-amber-500/25 disabled:opacity-40"
          >
            {bcBusy ? "발송 중…" : "전체 회원에게 일괄 발송"}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">최근 발송 (본인)</h3>
        <div className="table-scroll overflow-x-auto rounded-xl border border-slate-600/30 bg-slate-900/30">
          <table className="w-full min-w-[520px] text-left text-sm text-slate-400">
            <thead className="border-b border-slate-600/40 text-xs uppercase text-slate-500">
              <tr>
                <th className="p-3">시각</th>
                <th className="p-3">받는 사람</th>
                <th className="p-3">구분</th>
                <th className="p-3">제목</th>
              </tr>
            </thead>
            <tbody>
              {outbox.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-600">
                    최근 발송 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                outbox.map((o) => (
                  <tr key={o.id} className="border-b border-slate-700/50">
                    <td className="p-3 font-mono text-xs text-slate-500">{o.created_at?.slice(0, 16) ?? "—"}</td>
                    <td className="p-3 font-medium text-sky-300/90">{o.to_login_id}</td>
                    <td className="p-3">
                      {o.is_important ? (
                        <span className="rounded border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200/95">
                          중요
                        </span>
                      ) : (
                        <span className="text-slate-600">일반</span>
                      )}
                    </td>
                    <td className="p-3 text-slate-300">{o.title}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
