/**
 * 플레이어 화면 금액·포인트: 소수 이하 버리고 정수만 천 단위 구분.
 */
export function formatPlayerMoney(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "—";
  const s0 = String(raw).trim().replace(/,/g, "");
  if (s0 === "" || s0 === "—") return "—";
  const n = Number(s0);
  if (!Number.isFinite(n)) return String(raw);
  return Math.trunc(n).toLocaleString("ko-KR");
}
