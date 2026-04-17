/**
 * 사이드바 활성 링크: `/league-hub`가 `/league-hub/odds-live`에도 매칭되는 문제를 막기 위해
 * 현재 경로에 대해 등록된 href 중 **가장 긴(prefix) 일치**만 활성으로 본다.
 */
export function activeNavHref(pathname: string, hrefs: readonly string[]): string | null {
  const candidates: string[] = [];
  for (const h of hrefs) {
    if (h === "/") {
      if (pathname === "/") candidates.push("/");
      continue;
    }
    if (pathname === h || pathname.startsWith(`${h}/`)) {
      candidates.push(h);
    }
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.length >= b.length ? a : b));
}

export function isNavItemActive(pathname: string, itemHref: string, allHrefs: readonly string[]): boolean {
  return activeNavHref(pathname, allHrefs) === itemHref;
}
