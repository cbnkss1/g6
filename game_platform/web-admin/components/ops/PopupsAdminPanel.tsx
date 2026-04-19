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

export function PopupsAdminPanel() {
  const token = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);
  const isSuper = authUser?.role === "super_admin";

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

  const loadPopups = useCallback(async () => {
    if (!base || !token) return;
    setPopErr(null);
    const r = await adminFetch(`${base}/admin/site-popups`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!r.ok) {
      setPopErr(await r.text());
      return;
    }
    const d = (await r.json()) as { items: PopupRow[] };
    setPopups(d.items ?? []);
  }, [base, token]);

  useEffect(() => {
    void loadPopups();
  }, [loadPopups]);

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
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: next }),
    });
    if (r.ok) void loadPopups();
  }

  async function deletePopup(id: number) {
    if (!base || !token || !confirm("이 팝업을 삭제할까요?")) return;
    const r = await adminFetch(`${base}/admin/site-popups/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) void loadPopups();
  }

  return (
    <div className="space-y-8">
      <p className="text-sm leading-relaxed text-slate-500">
        플레이어 화면과 동일 API로 연결됩니다. 팝업은 사이트 ID 기준으로 비로그인 방문자에게도 노출될 수 있습니다. HTML은 허용되며 스크립트는
        제거됩니다.
      </p>

      <section className="quantum-card space-y-4 p-5 sm:p-6">
        <h3 className="text-base font-semibold text-slate-100">새 팝업 등록</h3>
        {popErr ? <p className="text-sm text-rose-400">{popErr}</p> : null}

        <form onSubmit={onCreatePopup} className="grid gap-4">
          {isSuper ? (
            <label className="quantum-label">
              site_id (선택, 비우면 기본 테넌트)
              <input
                value={pSiteId}
                onChange={(e) => setPSiteId(e.target.value)}
                className="quantum-input mt-1.5 font-mono text-xs"
                placeholder="a0000001-0000-4000-8000-000000000001"
              />
            </label>
          ) : null}
          <label className="quantum-label">
            제목
            <input
              value={pTitle}
              onChange={(e) => setPTitle(e.target.value)}
              className="quantum-input mt-1.5"
              required
            />
          </label>
          <label className="quantum-label">
            본문 (HTML 가능)
            <textarea
              value={pHtml}
              onChange={(e) => setPHtml(e.target.value)}
              rows={5}
              className="quantum-input mt-1.5 min-h-[120px] resize-y font-mono text-xs"
              required
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="quantum-label">
              기기
              <select
                value={pDevice}
                onChange={(e) => setPDevice(e.target.value as "all" | "pc" | "mobile")}
                className="quantum-input mt-1.5"
              >
                <option value="all">전체</option>
                <option value="pc">PC</option>
                <option value="mobile">모바일</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="quantum-label">
                Left
                <input
                  type="number"
                  value={pLeft}
                  onChange={(e) => setPLeft(Number(e.target.value))}
                  className="quantum-input mt-1.5"
                />
              </label>
              <label className="quantum-label">
                Top
                <input
                  type="number"
                  value={pTop}
                  onChange={(e) => setPTop(Number(e.target.value))}
                  className="quantum-input mt-1.5"
                />
              </label>
              <label className="quantum-label">
                너비
                <input
                  type="number"
                  value={pW}
                  onChange={(e) => setPW(Number(e.target.value))}
                  className="quantum-input mt-1.5"
                />
              </label>
              <label className="quantum-label">
                높이
                <input
                  type="number"
                  value={pH}
                  onChange={(e) => setPH(Number(e.target.value))}
                  className="quantum-input mt-1.5"
                />
              </label>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="quantum-label">
              노출 시작 (로컬 시각)
              <input
                type="datetime-local"
                value={pStart}
                onChange={(e) => setPStart(e.target.value)}
                className="quantum-input mt-1.5"
                required
              />
            </label>
            <label className="quantum-label">
              노출 종료
              <input
                type="datetime-local"
                value={pEnd}
                onChange={(e) => setPEnd(e.target.value)}
                className="quantum-input mt-1.5"
                required
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={popBusy || !token}
            className="w-fit rounded-xl border border-violet-500/40 bg-violet-500/15 px-5 py-2.5 text-sm font-medium text-violet-100 hover:bg-violet-500/25 disabled:opacity-40"
          >
            {popBusy ? "저장 중…" : "팝업 등록"}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">등록된 팝업</h3>
        <div className="table-scroll overflow-x-auto rounded-xl border border-slate-600/30 bg-slate-900/30">
          <table className="w-full min-w-[640px] text-left text-sm text-slate-400">
            <thead className="border-b border-slate-600/40 text-xs uppercase text-slate-500">
              <tr>
                <th className="p-3">ID</th>
                <th className="p-3">제목</th>
                <th className="p-3">기기</th>
                <th className="p-3">기간</th>
                <th className="p-3">활성</th>
                <th className="p-3">동작</th>
              </tr>
            </thead>
            <tbody>
              {popups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-600">
                    등록된 팝업이 없습니다.
                  </td>
                </tr>
              ) : (
                popups.map((p) => (
                  <tr key={p.id} className="border-b border-slate-700/50">
                    <td className="p-3 font-mono text-xs">{p.id}</td>
                    <td className="p-3 text-slate-200">{p.title}</td>
                    <td className="p-3">{p.device}</td>
                    <td className="max-w-[200px] truncate p-3 font-mono text-[11px] text-slate-500">
                      {p.starts_at?.slice(0, 16)} ~ {p.ends_at?.slice(0, 16)}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => void togglePopupActive(p, !p.is_active)}
                        className="text-sky-400 hover:underline"
                      >
                        {p.is_active ? "ON" : "off"}
                      </button>
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => void deletePopup(p.id)}
                        className="text-rose-400 hover:underline"
                      >
                        삭제
                      </button>
                    </td>
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
