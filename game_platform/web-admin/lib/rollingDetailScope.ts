/** 롤링 원장 상세 팝업 `detail_scope` — API와 동일 */
export type RollingDetailScope =
  | "chain"
  | "self"
  | "losing"
  | "losing_self"
  | "referral"
  | "all";

export type RollingRowSums = {
  rolling_paid_sum?: string;
  rolling_self_sum?: string;
  /** 본인 배팅(배터=수령인) 차액 루징 */
  rolling_diff_losing_self_sum?: string;
  /** 하부 배팅에서 상부로 지급된 차액 루징 */
  rolling_diff_losing_downline_sum?: string;
  rolling_referral_sum?: string;
};

function parseSum(s: string | undefined): number {
  const raw = String(s ?? "0")
    .trim()
    .replace(/,/g, "");
  const x = Number.parseFloat(raw);
  return Number.isFinite(x) ? x : 0;
}

/** 관리자 표 `formatMoneyInt`와 동일: 원 단위 절사(소수 버림) */
function truncWon(n: number): number {
  return Math.trunc(n);
}

/**
 * 수령인 행 합계로 상세 팝업 기본 필터를 고릅니다.
 * 차액 루징은 하부(losing)·본인(losing_self) 열을 각각 비교합니다.
 */
export function defaultDetailScopeFromRow(row: RollingRowSums): RollingDetailScope {
  const diff = parseSum(row.rolling_paid_sum);
  const self = parseSum(row.rolling_self_sum);
  const losingDown = parseSum(row.rolling_diff_losing_downline_sum);
  const losingSelf = parseSum(row.rolling_diff_losing_self_sum);
  const ref = parseSum(row.rolling_referral_sum);

  const candidates: { scope: RollingDetailScope; raw: number; wonMag: number }[] = [
    { scope: "chain", raw: diff, wonMag: Math.abs(truncWon(diff)) },
    { scope: "self", raw: self, wonMag: Math.abs(truncWon(self)) },
    { scope: "losing", raw: losingDown, wonMag: Math.abs(truncWon(losingDown)) },
    { scope: "losing_self", raw: losingSelf, wonMag: Math.abs(truncWon(losingSelf)) },
    { scope: "referral", raw: ref, wonMag: Math.abs(truncWon(ref)) },
  ];

  const maxWonMag = Math.max(...candidates.map((c) => c.wonMag));
  if (maxWonMag > 0) {
    const tieBreak: RollingDetailScope[] = ["self", "chain", "referral", "losing_self", "losing"];
    const atMax = candidates.filter((c) => c.wonMag === maxWonMag);
    if (atMax.length === 1) return atMax[0].scope;
    for (const scope of tieBreak) {
      const hit = atMax.find((c) => c.scope === scope);
      if (hit) return hit.scope;
    }
    return atMax[0].scope;
  }

  const maxRaw = Math.max(...candidates.map((c) => Math.abs(c.raw)));
  if (maxRaw < 1e-12) return "all";
  const tieBreak2: RollingDetailScope[] = ["self", "chain", "referral", "losing_self", "losing"];
  const atRaw = candidates.filter((c) => Math.abs(c.raw) === maxRaw);
  if (atRaw.length === 1) return atRaw[0].scope;
  for (const scope of tieBreak2) {
    const hit = atRaw.find((c) => c.scope === scope);
    if (hit) return hit.scope;
  }
  return atRaw[0].scope;
}
