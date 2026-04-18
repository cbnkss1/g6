/** 플레이어 웹 상단·지갑에서 쓰는 외부 링크 (web-public `.env.local`의 NEXT_PUBLIC_*). */

function trimUrl(v: string | undefined): string | null {
  const u = v?.trim();
  return u ? u : null;
}

export function playerSupportUrl(): string | null {
  return trimUrl(process.env.NEXT_PUBLIC_PLAYER_SUPPORT_URL);
}

export function playerMemoUrl(): string | null {
  return trimUrl(process.env.NEXT_PUBLIC_PLAYER_MEMO_URL);
}

/** 총판·스태프용 백오피스 등 (플레이어에게 노출할지 운영에서 선택). */
export function playerAdminWebUrl(): string | null {
  return trimUrl(process.env.NEXT_PUBLIC_ADMIN_WEB_URL);
}

/** 고객센터 링크: 외부 URL이 없으면 사이트 내 `/support`. */
export function playerSupportHref(): string {
  return playerSupportUrl() ?? "/support";
}

/** `NEXT_PUBLIC_PLAYER_SUPPORT_URL` 이 있으면 외부 고객센터(새 탭), 없으면 내부 페이지. */
export function playerSupportIsExternal(): boolean {
  return Boolean(trimUrl(process.env.NEXT_PUBLIC_PLAYER_SUPPORT_URL));
}
