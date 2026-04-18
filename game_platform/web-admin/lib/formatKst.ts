/** API ISO 문자열을 한국 시간으로 표시 */
const TZ = "Asia/Seoul";

export function formatIsoAsKst(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString("ko-KR", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** KST 기준 오늘 YYYY-MM-DD */
export function kstTodayYmd(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: TZ }).slice(0, 10);
}

/** KST 기준 N일 전 YYYY-MM-DD */
export function kstDaysAgoYmd(days: number): string {
  const today = kstTodayYmd();
  const noonKst = Date.parse(`${today}T12:00:00+09:00`);
  const d = new Date(noonKst - days * 86400000);
  return d.toLocaleString("sv-SE", { timeZone: TZ }).slice(0, 10);
}
