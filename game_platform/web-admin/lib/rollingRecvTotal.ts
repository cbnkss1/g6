/** GET /admin/settlements/rolling-lines 수령인 행 — API `rolling_recv_total` 또는 열 합산 */
export type RollingRecvRow = {
  rolling_recv_total?: string;
  rolling_paid_sum?: string;
  rolling_self_sum?: string;
  rolling_diff_losing_self_sum?: string;
  rolling_diff_losing_downline_sum?: string;
  /** 구 API 호환(차액 루징 단일 합) */
  rolling_diff_losing_sum?: string;
  rolling_referral_sum?: string;
};

function parse(s: string | undefined): number {
  const x = Number.parseFloat(String(s ?? "0").trim().replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
}

/** 수령인이 받은 롤링P 합(차액+본인+루징+추천). 구 API는 단일 루징 열. */
export function rollingRecvTotalString(row: RollingRecvRow): string {
  const t = String(row.rolling_recv_total ?? "").trim();
  if (t !== "" && t !== "—") return t;
  const legacy = parse(row.rolling_diff_losing_sum);
  const ls = parse(row.rolling_diff_losing_self_sum);
  const ld = parse(row.rolling_diff_losing_downline_sum);
  const lose = legacy || ls + ld;
  const sum = parse(row.rolling_paid_sum) + parse(row.rolling_self_sum) + lose + parse(row.rolling_referral_sum);
  return String(sum);
}
