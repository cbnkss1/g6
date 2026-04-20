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

/** 관리자 표 `formatMoneyInt`와 동일: 원 단위 절사(소수 버림) */
function truncWon(n: number): number {
  return Math.trunc(n);
}

/**
 * 수령인 행 합계로 상세 팝업 기본 필터를 고릅니다.
 *
 * 예전에는 차액(chain)을 무조건 우선했는데, 리프·`test` 같이 **본인 롤링만** 의미 있는데도
 * 차액에 원 미만 먼지가 있으면 chain으로 열려 내역이 비거나 기대와 달랐습니다.
 * 화면에 찍히는 정수(원)와 같은 스케일에서 **가장 큰 절대값**이 있는 구간을 쓰고,
 * 동률이면 본인 → 차액 → 추천 → 루징 순으로 택합니다.
 */
export function defaultDetailScopeFromRow(row: RollingRowSums): RollingDetailScope {
  const diff = parseSum(row.rolling_paid_sum);
  const self = parseSum(row.rolling_self_sum);
  const losing = parseSum(row.rolling_diff_losing_sum);
  const ref = parseSum(row.rolling_referral_sum);

  const candidates: { scope: RollingDetailScope; raw: number; wonMag: number }[] = [
    { scope: "chain", raw: diff, wonMag: Math.abs(truncWon(diff)) },
    { scope: "self", raw: self, wonMag: Math.abs(truncWon(self)) },
    { scope: "losing", raw: losing, wonMag: Math.abs(truncWon(losing)) },
    { scope: "referral", raw: ref, wonMag: Math.abs(truncWon(ref)) },
  ];

  const maxWonMag = Math.max(...candidates.map((c) => c.wonMag));
  if (maxWonMag > 0) {
    const tieBreak: RollingDetailScope[] = ["self", "chain", "referral", "losing"];
    const atMax = candidates.filter((c) => c.wonMag === maxWonMag);
    if (atMax.length === 1) return atMax[0].scope;
    for (const scope of tieBreak) {
      const hit = atMax.find((c) => c.scope === scope);
      if (hit) return hit.scope;
    }
    return atMax[0].scope;
  }

  // 원 단위로는 전부 0이면 소수·센트 단위만 있는 경우: raw 절대값 최대
  const maxRaw = Math.max(...candidates.map((c) => Math.abs(c.raw)));
  if (maxRaw < 1e-12) return "all";
  const tieBreak2: RollingDetailScope[] = ["self", "chain", "referral", "losing"];
  const atRaw = candidates.filter((c) => Math.abs(c.raw) === maxRaw);
  if (atRaw.length === 1) return atRaw[0].scope;
  for (const scope of tieBreak2) {
    const hit = atRaw.find((c) => c.scope === scope);
    if (hit) return hit.scope;
  }
  return atRaw[0].scope;
}
