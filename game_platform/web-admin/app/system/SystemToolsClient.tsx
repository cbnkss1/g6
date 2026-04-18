"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type PopupRow = {
  id: number;
  site_id: string;
  title: string;
  body_html: string;
  device: string;
  nw_left: number;
  nw_top: number;
  nw_width: number;
  nw_height: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  sort_order: number;
};

type OutboxRow = {
  id: number;
  to_login_id: string;
  title: string;
  body_preview: string;
  created_at: string | null;
};

export function SystemToolsClient() {
  const token = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);
  const isSuper = authUser?.role === "super_admin";

  const [loginId, setLoginId] = useState("");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [sendOk, setSendOk] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<OutboxRow[]>([]);

  const [popups, setPopups] = useState<PopupRow[]>([]);
  const [popErr, setPopErr] = useState<string | null>(null);

  const [pTitle, setPTitle] = useState("");
  const [pHtml, setPHtml] = useState("");
  const [pDevice, setPDevice] = useState<"all" | "pc" | "mobile">("all");
  const [pLeft, setPLeft] = useState(50);
  const [pTop, setPTop] = useState(80);
  const [pW, setPW] = useState(420);
  const [pH, setPH] = useState(360);
  const [pStart, setPStart] = useState("");
  const [pEnd, setPEnd] = useState("");
  const [pSiteId, setPSiteId] = useState("");
  const [popBusy, setPopBusy] = useState(false);

  const base = publicApiBase();
  const headers = { Authorization: `Bearer ${token}` };

  const loadOutbox = useCallback(async () => {
    if (!base || !token) return;
    const r = await adminFetch(`${base}/admin/player-notifications/outbox?limit=30`, {
      headers,
      cache: "no-store",
    });
    if (!r.ok) return;
    const d = (await r.json()) as { items: OutboxRow[] };
    setOutbox(d.items ?? []);
  }, [base, token]);

  const loadPopups = useCallback(async () => {
    if (!base || !token) return;
    setPopErr(null);
    const r = await adminFetch(`${base}/admin/site-popups`, { headers, cache: "no-store" });
    if (!r.ok) {
      setPopErr(await r.text());
      return;
    }
    const d = (await r.json()) as { items: PopupRow[] };
    setPopups(d.items ?? []);
  }, [base, token]);

  useEffect(() => {
    void loadOutbox();
    void loadPopups();
  }, [loadOutbox, loadPopups]);

  useEffect(() => {
    const now = new Date();
    const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const toLocal = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    if (!pStart) setPStart(toLocal(now));
    if (!pEnd) setPEnd(toLocal(end));
  }, [pStart, pEnd]);

  async function onSendMessage(e: React.FormEvent) {
    e.preventDefault();
    setSendErr(null);
    setSendOk(null);
    if (!base || !token) return;
    setSendBusy(true);
    try {
      const r = await adminFetch(`${base}/admin/player-notifications/send`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          login_id: loginId.trim(),
          title: msgTitle.trim(),
          body: msgBody.trim(),
        }),
      });
      const raw = await r.text();
      if (!r.ok) throw new Error(raw || `HTTP ${r.status}`);
      setSendOk("발송했습니다. 플레이어 쪽지함에서 확인할 수 있습니다.");
      setMsgTitle("");
      setMsgBody("");
      void loadOutbox();
    } catch (err) {
      setSendErr(err instanceof Error ? err.message : "실패");
    } finally {
      setSendBusy(false);
    }
  }

  async function onCreatePopup(e: React.FormEvent) {
    e.preventDefault();
    setPopErr(null);
    if (!base || !token) return;
    if (!pStart || !pEnd) {
      setPopErr("시작·종료 시각을 입력하세요.");
      return;
    }
    setPopBusy(true);
    try {
      const body: Record<string, unknown> = {
        title: pTitle.trim(),
        body_html: pHtml,
        device: pDevice,
        nw_left: pLeft,
        nw_top: pTop,
        nw_width: pW,
        nw_height: pH,
        starts_at: new Date(pStart).toISOString(),
        ends_at: new Date(pEnd).toISOString(),
        is_active: true,
        sort_order: 0,
      };
      if (isSuper && pSiteId.trim()) body.site_id = pSiteId.trim();
      const r = await adminFetch(`${base}/admin/site-popups`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw = await r.text();
      if (!r.ok) throw new Error(raw || `HTTP ${r.status}`);
      setPTitle("");
      setPHtml("");
      void loadPopups();
    } catch (err) {
      setPopErr(err instanceof Error ? err.message : "팝업 저장 실패");
    } finally {
      setPopBusy(false);
    }
  }

  async function togglePopupActive(row: PopupRow, next: boolean) {
    if (!base || !token) return;
    const r = await adminFetch(`${base}/admin/site-popups/${row.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: next }),
    });
    if (r.ok) void loadPopups();
  }

  async function deletePopup(id: number) {
    if (!base || !token || !confirm("이 팝업을 삭제할까요?")) return;
    const r = await adminFetch(`${base}/admin/site-popups/${id}`, { method: "DELETE", headers });
    if (r.ok) void loadPopups();
  }

  return (
    <div className="space-y-10">
      <p className="text-sm text-slate-500">
        플레이어 화면(<span className="text-slate-400">as.*</span>)과 같은 API로 연결됩니다. 쪽지는 로그인 회원만, 팝업은 사이트 ID 기준으로 비로그인 방문자에게도 노출됩니다.
      </p>

      <section className="space-y-4">
        <h3 className="text-base font-semibold text-slate-100">1. 회원에게 쪽지 보내기</h3>
        <form onSubmit={onSendMessage} className="max-w-xl space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <label className="block text-xs text-slate-500">
            플레이어 로그인 ID
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              required
              placeholder="예: player01"
            />
          </label>
          <label className="block text-xs text-slate-500">
            제목
            <input
              value={msgTitle}
              onChange={(e) => setMsgTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              required
              maxLength={200}
            />
          </label>
          <label className="block text-xs text-slate-500">
            내용
            <textarea
              value={msgBody}
              onChange={(e) => setMsgBody(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              required
            />
          </label>
          {sendErr ? <p className="text-sm text-red-400">{sendErr}</p> : null}
          {sendOk ? <p className="text-sm text-emerald-400">{sendOk}</p> : null}
          <button
            type="submit"
            disabled={sendBusy || !token}
            className="rounded-lg border border-premium/40 bg-premium/15 px-4 py-2 text-sm font-medium text-premium hover:bg-premium/25 disabled:opacity-40"
          >
            {sendBusy ? "보내는 중…" : "쪽지 발송"}
          </button>
        </form>

        <div className="max-w-2xl">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">최근 발송 (본인)</p>
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full min-w-[480px] text-left text-xs text-slate-400">
              <thead className="border-b border-slate-800 text-slate-500">
                <tr>
                  <th className="p-2">시각</th>
                  <th className="p-2">받는 사람</th>
                  <th className="p-2">제목</th>
                </tr>
              </thead>
              <tbody>
                {outbox.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-slate-600">
                      없음
                    </td>
                  </tr>
                ) : (
                  outbox.map((o) => (
                    <tr key={o.id} className="border-b border-slate-800/80">
                      <td className="p-2 font-mono">{o.created_at?.slice(0, 16) ?? "—"}</td>
                      <td className="p-2 text-premium">{o.to_login_id}</td>
                      <td className="p-2">{o.title}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs text-slate-600">
          플레이어는 플레이어 웹의 <span className="text-slate-400">/messages</span> 화면에서 확인합니다.
        </p>
      </section>

      <section className="space-y-4">
        <h3 className="text-base font-semibold text-slate-100">2. 플레이어 화면 팝업</h3>
        {popErr ? <p className="text-sm text-red-400">{popErr}</p> : null}

        <form onSubmit={onCreatePopup} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          {isSuper ? (
            <label className="block text-xs text-slate-500">
              site_id (선택, 비우면 기본 테넌트)
              <input
                value={pSiteId}
                onChange={(e) => setPSiteId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200"
                placeholder="a0000001-0000-4000-8000-000000000001"
              />
            </label>
          ) : null}
          <label className="block text-xs text-slate-500">
            제목
            <input
              value={pTitle}
              onChange={(e) => setPTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              required
            />
          </label>
          <label className="block text-xs text-slate-500">
            본문 (HTML 가능, 스크립트는 제거됨)
            <textarea
              value={pHtml}
              onChange={(e) => setPHtml(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200"
              required
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-500">
              기기
              <select
                value={pDevice}
                onChange={(e) => setPDevice(e.target.value as "all" | "pc" | "mobile")}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              >
                <option value="all">전체</option>
                <option value="pc">PC</option>
                <option value="mobile">모바일</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">
                Left
                <input
                  type="number"
                  value={pLeft}
                  onChange={(e) => setPLeft(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-500">
                Top
                <input
                  type="number"
                  value={pTop}
                  onChange={(e) => setPTop(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-500">
                너비
                <input
                  type="number"
                  value={pW}
                  onChange={(e) => setPW(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-500">
                높이
                <input
                  type="number"
                  value={pH}
                  onChange={(e) => setPH(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                />
              </label>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-500">
              노출 시작 (로컬 시각)
              <input
                type="datetime-local"
                value={pStart}
                onChange={(e) => setPStart(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                required
              />
            </label>
            <label className="text-xs text-slate-500">
              노출 종료
              <input
                type="datetime-local"
                value={pEnd}
                onChange={(e) => setPEnd(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                required
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={popBusy || !token}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/20 disabled:opacity-40"
          >
            {popBusy ? "저장 중…" : "팝업 등록"}
          </button>
        </form>

        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-[640px] text-left text-xs text-slate-400">
            <thead className="border-b border-slate-800 text-slate-500">
              <tr>
                <th className="p-2">ID</th>
                <th className="p-2">제목</th>
                <th className="p-2">기기</th>
                <th className="p-2">기간 (KST)</th>
                <th className="p-2">활성</th>
                <th className="p-2">동작</th>
              </tr>
            </thead>
            <tbody>
              {popups.map((p) => (
                <tr key={p.id} className="border-b border-slate-800/80">
                  <td className="p-2 font-mono">{p.id}</td>
                  <td className="p-2">{p.title}</td>
                  <td className="p-2">{p.device}</td>
                  <td className="max-w-[200px] truncate p-2 font-mono text-[10px]">
                    {p.starts_at?.slice(0, 16)} ~ {p.ends_at?.slice(0, 16)}
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => void togglePopupActive(p, !p.is_active)}
                      className="text-premium hover:underline"
                    >
                      {p.is_active ? "ON" : "off"}
                    </button>
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => void deletePopup(p.id)}
                      className="text-red-400 hover:underline"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
