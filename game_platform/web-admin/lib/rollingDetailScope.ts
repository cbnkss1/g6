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
 *
 * **하부 차액 루징(`losing`)** 은 금액이 커도 “롤링”으로 보는 수령(차액 롤링 100원 단위 등)보다
 * 나중에만 기본 탭으로 씁니다. kcm111 처럼 차액 롤링+하부 루징이 같이 있으면 차액 롤링(chain)을 연다.
 */
export function defaultDetailScopeFromRow(row: RollingRowSums): RollingDetailScope {
  const diff = parseSum(row.rolling_paid_sum);
  const self = parseSum(row.rolling_self_sum);
  const losingDown = parseSum(row.rolling_diff_losing_downline_sum);
  const losingSelf = parseSum(row.rolling_diff_losing_self_sum);
  const ref = parseSum(row.rolling_referral_sum);

  const primary: { scope: RollingDetailScope; raw: number; wonMag: number }[] = [
    { scope: "chain", raw: diff, wonMag: Math.abs(truncWon(diff)) },
    { scope: "self", raw: self, wonMag: Math.abs(truncWon(self)) },
    { scope: "referral", raw: ref, wonMag: Math.abs(truncWon(ref)) },
    { scope: "losing_self", raw: losingSelf, wonMag: Math.abs(truncWon(losingSelf)) },
  ];
  const losingDownCand = {
    scope: "losing" as const,
    raw: losingDown,
    wonMag: Math.abs(truncWon(losingDown)),
  };

  const maxPrimary = Math.max(...primary.map((c) => c.wonMag));
  if (maxPrimary > 0) {
    const tieBreak: RollingDetailScope[] = ["self", "chain", "referral", "losing_self"];
    const atMax = primary.filter((c) => c.wonMag === maxPrimary);
    if (atMax.length === 1) return atMax[0].scope;
    for (const scope of tieBreak) {
      const hit = atMax.find((c) => c.scope === scope);
      if (hit) return hit.scope;
    }
    return atMax[0].scope;
  }

  if (losingDownCand.wonMag > 0 || Math.abs(losingDownCand.raw) > 1e-12) {
    return "losing";
  }

  const all = [...primary, losingDownCand];
  const maxRaw = Math.max(...all.map((c) => Math.abs(c.raw)));
  if (maxRaw < 1e-12) return "all";
  const tieBreak2: RollingDetailScope[] = ["self", "chain", "referral", "losing_self", "losing"];
  const atRaw = all.filter((c) => Math.abs(c.raw) === maxRaw);
  if (atRaw.length === 1) return atRaw[0].scope;
  for (const scope of tieBreak2) {
    const hit = atRaw.find((c) => c.scope === scope);
    if (hit) return hit.scope;
  }
  return atRaw[0].scope;
}
