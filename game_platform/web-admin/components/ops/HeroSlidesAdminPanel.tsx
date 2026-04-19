"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { publicApiBase } from "@/lib/publicApiBase";
import { useAuthStore } from "@/store/useAuthStore";

type HeroRow = {
  id: number;
  site_id: string;
  image_url: string | null;
  title: string;
  subtitle: string;
  link_url: string | null;
  device: string;
  sort_order: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
};

export function HeroSlidesAdminPanel() {
  const token = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);
  const isSuper = authUser?.role === "super_admin";

  const [rows, setRows] = useState<HeroRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const [hImage, setHImage] = useState("");
  const [hTitle, setHTitle] = useState("");
  const [hSub, setHSub] = useState("");
  const [hLink, setHLink] = useState("");
  const [hDevice, setHDevice] = useState<"all" | "pc" | "mobile">("all");
  const [hSort, setHSort] = useState(0);
  const [hStart, setHStart] = useState("");
  const [hEnd, setHEnd] = useState("");
  const [hSiteId, setHSiteId] = useState("");

  const base = publicApiBase();

  const loadRows = useCallback(async () => {
    if (!base || !token) return;
    setErr(null);
    const r = await adminFetch(`${base}/admin/hero-slides`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!r.ok) {
      setErr(await r.text());
      return;
    }
    const d = (await r.json()) as { items: HeroRow[] };
    setRows(d.items ?? []);
  }, [base, token]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    const now = new Date();
    const end = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    const toLocal = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    if (!hStart) setHStart(toLocal(now));
    if (!hEnd) setHEnd(toLocal(end));
  }, [hStart, hEnd]);

  function resetForm() {
    setEditId(null);
    setHImage("");
    setHTitle("");
    setHSub("");
    setHLink("");
    setHDevice("all");
    setHSort(0);
    setHEnd("");
    setHStart("");
  }

  function startEdit(row: HeroRow) {
    setEditId(row.id);
    setHImage(row.image_url || "");
    setHTitle(row.title || "");
    setHSub(row.subtitle || "");
    setHLink(row.link_url || "");
    setHDevice((row.device as "all" | "pc" | "mobile") || "all");
    setHSort(row.sort_order);
    setHStart(row.starts_at.slice(0, 16));
    setHEnd(row.ends_at.slice(0, 16));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!base || !token) return;
    if (!hStart || !hEnd) {
      setErr("시작·종료 시각을 입력하세요.");
      return;
    }
    const img = hImage.trim();
    const t = hTitle.trim();
    const s = hSub.trim();
    if (!img && !t && !s) {
      setErr("이미지 URL, 제목, 부제 중 하나 이상을 입력하세요.");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        image_url: img || null,
        title: t,
        subtitle: s,
        link_url: hLink.trim() || null,
        device: hDevice,
        sort_order: hSort,
        starts_at: new Date(hStart).toISOString(),
        ends_at: new Date(hEnd).toISOString(),
      };
      if (!editId) body.is_active = true;
      if (isSuper && hSiteId.trim() && !editId) body.site_id = hSiteId.trim();

      const url = editId ? `${base}/admin/hero-slides/${editId}` : `${base}/admin/hero-slides`;
      const method = editId ? "PATCH" : "POST";
      const r = await adminFetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw = await r.text();
      if (!r.ok) throw new Error(raw || `HTTP ${r.status}`);
      resetForm();
      void loadRows();
    } catch (err_) {
      setErr(err_ instanceof Error ? err_.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: HeroRow, next: boolean) {
    if (!base || !token) return;
    const r = await adminFetch(`${base}/admin/hero-slides/${row.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: next }),
    });
    if (r.ok) void loadRows();
  }

  async function deleteRow(id: number) {
    if (!base || !token || !confirm("이 슬라이드를 삭제할까요?")) return;
    const r = await adminFetch(`${base}/admin/hero-slides/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) {
      if (editId === id) resetForm();
      void loadRows();
    }
  }

  return (
    <div className="space-y-8">
      <p className="text-sm leading-relaxed text-slate-500">
        플레이어 메인 상단 <strong className="text-slate-300">LIVE EVENTS</strong> 배너입니다. 이미지 URL(공개 HTTPS)·제목·부제를
        조합할 수 있으며, 최대 여러 컷이 순서대로 슬라이드됩니다. 이미지만 넣거나 글만 넣어도 됩니다.
      </p>

      <section className="quantum-card space-y-4 p-5 sm:p-6">
        <h3 className="text-base font-semibold text-slate-100">{editId ? `슬라이드 수정 #${editId}` : "새 슬라이드 등록"}</h3>
        {err ? <p className="text-sm text-rose-400">{err}</p> : null}

        <form onSubmit={onSubmit} className="grid gap-4">
          {isSuper && !editId ? (
            <label className="quantum-label">
              site_id (선택)
              <input
                value={hSiteId}
                onChange={(e) => setHSiteId(e.target.value)}
                className="quantum-input mt-1.5 font-mono text-xs"
                placeholder="기본 테넌트면 비움"
              />
            </label>
          ) : null}
          <label className="quantum-label">
            배너 이미지 URL (선택, https 권장)
            <input
              value={hImage}
              onChange={(e) => setHImage(e.target.value)}
              className="quantum-input mt-1.5 font-mono text-xs"
              placeholder="https://…"
            />
          </label>
          <label className="quantum-label">
            제목 (선택, 퀀텀 그라데이션 스타일)
            <input value={hTitle} onChange={(e) => setHTitle(e.target.value)} className="quantum-input mt-1.5" />
          </label>
          <label className="quantum-label">
            부제 / 설명 (선택)
            <textarea value={hSub} onChange={(e) => setHSub(e.target.value)} rows={3} className="quantum-input mt-1.5 resize-y" />
          </label>
          <label className="quantum-label">
            클릭 시 이동 URL (선택, 새 탭)
            <input value={hLink} onChange={(e) => setHLink(e.target.value)} className="quantum-input mt-1.5 font-mono text-xs" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="quantum-label">
              기기
              <select
                value={hDevice}
                onChange={(e) => setHDevice(e.target.value as "all" | "pc" | "mobile")}
                className="quantum-input mt-1.5"
              >
                <option value="all">전체</option>
                <option value="pc">PC</option>
                <option value="mobile">모바일</option>
              </select>
            </label>
            <label className="quantum-label">
              정렬 (작을수록 먼저)
              <input
                type="number"
                value={hSort}
                onChange={(e) => setHSort(Number(e.target.value))}
                className="quantum-input mt-1.5"
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="quantum-label">
              노출 시작
              <input type="datetime-local" value={hStart} onChange={(e) => setHStart(e.target.value)} className="quantum-input mt-1.5" required />
            </label>
            <label className="quantum-label">
              노출 종료
              <input type="datetime-local" value={hEnd} onChange={(e) => setHEnd(e.target.value)} className="quantum-input mt-1.5" required />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !token}
              className="rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-5 py-2.5 text-sm font-medium text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-40"
            >
              {busy ? "저장 중…" : editId ? "수정 저장" : "등록"}
            </button>
            {editId ? (
              <button
                type="button"
                onClick={() => resetForm()}
                className="rounded-xl border border-slate-600/50 px-5 py-2.5 text-sm text-slate-400 hover:bg-slate-800/50"
              >
                취소
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">등록된 슬라이드</h3>
        <div className="table-scroll overflow-x-auto rounded-xl border border-slate-600/30 bg-slate-900/30">
          <table className="w-full min-w-[720px] text-left text-sm text-slate-400">
            <thead className="border-b border-slate-600/40 text-xs uppercase text-slate-500">
              <tr>
                <th className="p-3">ID</th>
                <th className="p-3">미리보기</th>
                <th className="p-3">제목</th>
                <th className="p-3">기기</th>
                <th className="p-3">기간</th>
                <th className="p-3">활성</th>
                <th className="p-3">동작</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-600">
                    등록된 슬라이드가 없습니다. 비어 있으면 플레이어 메인은 기본 문구(폴백)를 씁니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-700/50">
                    <td className="p-3 font-mono text-xs">{row.id}</td>
                    <td className="p-3">
                      {row.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.image_url} alt="" className="h-10 w-20 rounded object-cover" />
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="max-w-[200px] truncate p-3 text-slate-200">{row.title || row.subtitle || "(이미지)"}</td>
                    <td className="p-3">{row.device}</td>
                    <td className="max-w-[200px] truncate p-3 font-mono text-[11px] text-slate-500">
                      {row.starts_at?.slice(0, 16)} ~ {row.ends_at?.slice(0, 16)}
                    </td>
                    <td className="p-3">
                      <button type="button" onClick={() => void toggleActive(row, !row.is_active)} className="text-sky-400 hover:underline">
                        {row.is_active ? "ON" : "off"}
                      </button>
                    </td>
                    <td className="p-3 space-x-2">
                      <button type="button" onClick={() => startEdit(row)} className="text-amber-400 hover:underline">
                        편집
                      </button>
                      <button type="button" onClick={() => void deleteRow(row.id)} className="text-rose-400 hover:underline">
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
