/**
 * 외부 V6 `providers[].title` → 어드민 `site_policies.game_providers` 카탈로그 키.
 * 매칭 실패 시 null → 정책 필터 생략(기존 노출 유지).
 */

import type { GameProviderFlags } from "./playerGamesApi";

export function casinoCatalogKeyFromProviderTitle(title: string): string | null {
  const t = (title || "").toLowerCase();
  if (/evolution|에볼/.test(t)) return "evolution";
  if (/dream\s*game|드림/.test(t)) return "dreamgame";
  if (/asia|playace|아시아/.test(t)) return "asia_gaming";
  if (/pragmatic|프라그마/.test(t)) return "pragmatic_live";
  if (/microgaming/.test(t) && /grand/i.test(title)) return "microgaming_grand";
  if (/microgaming/.test(t)) return "microgaming_plus";
  if (/oriental|오리엔탈/.test(t)) return "oriental";
  if (/vegas|베가스/.test(t)) return "vegas";
  if (/big\s*gaming|빅게이밍/.test(t)) return "big_gaming";
  if (/motivation|모티베이션/.test(t)) return "motivation";
  if (/izugi|이즈기/.test(t)) return "izugi";
  return null;
}

export function slotCatalogKeyFromProviderTitle(title: string): string | null {
  const t = (title || "").toLowerCase();
  if (/pragmatic|프라그마/.test(t)) return "pragmatic";
  if (/asian\s*game|아시안게임/.test(t)) return "asian_game_slot";
  if (/microgaming/.test(t)) return "microgaming_slot";
  if (/habanero|하바네로/.test(t)) return "habanero";
  if (/blueprint|블루프린트/.test(t)) return "blueprint";
  if (/\bcq9\b/.test(t)) return "cq9";
  if (/red\s*tiger|레드타이거/.test(t)) return "red_tiger";
  if (/slot\s*matrix|슬롯매트릭스/.test(t)) return "slot_matrix";
  if (/\bgmw\b/.test(t)) return "gmw";
  if (/booongo|부운고/.test(t)) return "booongo";
  if (/playson|플레이손/.test(t)) return "playson";
  return null;
}

export function isCasinoProviderVisible(flags: GameProviderFlags | null, title: string): boolean {
  if (!flags?.casino) return true;
  const key = casinoCatalogKeyFromProviderTitle(title);
  if (!key) return true;
  return flags.casino[key] !== false;
}

export function isSlotProviderVisible(flags: GameProviderFlags | null, title: string): boolean {
  if (!flags?.slot) return true;
  const key = slotCatalogKeyFromProviderTitle(title);
  if (!key) return true;
  return flags.slot[key] !== false;
}
