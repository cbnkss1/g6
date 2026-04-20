/** 롤링 원장 상세 팝업 `detail_scope` — API와 동일 */
export type RollingDetailScope = "chain" | "self" | "losing" | "referral" | "all";

export type RollingRowSums = {
  rolling_paid_sum?: string;
  rolling_self_sum?: string;
  rolling_diff_losing_sum?: string;
  rolling_referral_sum?: string;
};

function parseSum(s: string | undefined): number {
  const raw = String(s ?? "0")
    .trim()
    .replace(/,/g, "");
  const x = Number.parseFloat(raw);
  return Number.isFinite(x) ? x : 0;
}

/**
 * 수령인 행 합계로 상세 팝업 기본 필터를 고릅니다.
 * 차액 롤링이 있으면 chain, 없고 본인만 있으면 self … 전부 0이면 all.
 */
export function defaultDetailScopeFromRow(row: RollingRowSums): RollingDetailScope {
  if (parseSum(row.rolling_paid_sum) > 0) return "chain";
  if (parseSum(row.rolling_self_sum) > 0) return "self";
  if (parseSum(row.rolling_diff_losing_sum) > 0) return "losing";
  if (parseSum(row.rolling_referral_sum) > 0) return "referral";
  return "all";
}
