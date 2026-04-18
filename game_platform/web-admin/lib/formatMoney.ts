/**
 * 관리자 UI: 원·포인트 등 정수만 천 단위 구분 (소수 이하 제거).
 */
export function formatMoneyInt(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const s0 = String(v).trim().replace(/,/g, "");
  if (s0 === "" || s0 === "—") return "—";
  const n = Number(s0);
  if (!Number.isFinite(n)) return String(v);
  return Math.trunc(n).toLocaleString("ko-KR");
}
