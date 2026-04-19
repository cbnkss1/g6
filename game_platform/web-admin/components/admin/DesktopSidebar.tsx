"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { activeNavHref, isNavItemActive } from "@/lib/navActive";
import { useAdminUiStore } from "@/store/useAdminUiStore";
import { useAuthStore } from "@/store/useAuthStore";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** 이 항목 위에 구역 제목(레거시 내역 메뉴 묶음) */
  sectionTitle?: string;
  /** 배팅·종목과 구분되는 하위 줄(들여쓰기 + 왼쪽 강조) */
  nested?: boolean;
};

type NavGroup = {
  group: string;
  icon: string;
  items: NavItem[];
};

/** 참고: 상위 섹션 → 그 안으로만 트리 (정산 / 입출금 / 게임 분리) */
const NAV_GROUPS_BASE: NavGroup[] = [
  {
    group: "팀 네트워크",
    icon: "▦",
    items: [
      { href: "/agents", label: "내 팀 (다단계)", icon: "▦" },
      { href: "/agents/create", label: "계정 생성", icon: "＋" },
      { href: "/rolling", label: "롤링 요율", icon: "%" },
    ],
  },
  {
    group: "수익 관련",
    icon: "◇",
    items: [
      { href: "/", label: "메인 대시보드", icon: "◈" },
      { href: "/live", label: "실시간 현황", icon: "●" },
    ],
  },
  {
    group: "게임 관리",
    icon: "🎮",
    items: [
      { href: "/league-hub/odds-live", label: "라이브 배당 (Odds API)", icon: "◎" },
      { href: "/league-hub", label: "스포츠 배팅 · 정산", icon: "⚽" },
      { href: "/betting/powerball", label: "파워볼 API · 수집", icon: "⚡" },
      { href: "/toto", label: "토토", icon: "🎯" },
    ],
  },
  {
    group: "정산",
    icon: "¥",
    items: [
      { href: "/settlements", label: "전체 수익 · 정산판", icon: "¥" },
      { href: "/settlements/casino", label: "카지노 정산", icon: "🃏" },
      { href: "/settlements/slot", label: "슬롯 정산", icon: "🎰" },
      { href: "/settlements/powerball", label: "파워볼(미니게임) 정산", icon: "⚡" },
      { href: "/settlements/sports", label: "스포츠 정산", icon: "⚽" },
    ],
  },
  {
    group: "입출금",
    icon: "$",
    items: [
      { href: "/cash/request", label: "입출금 신청", icon: "◈" },
      { href: "/cash/transfer", label: "머니 · 포인트 전환", icon: "⇄" },
      {
        href: "/history/charge",
        label: "최근충전내역",
        icon: "↓",
        sectionTitle: "승인·처리 내역",
        nested: true,
      },
      { href: "/history/exchange", label: "최근환전내역", icon: "↑", nested: true },
      { href: "/support/super-inquiry", label: "슈퍼관리자 문의", icon: "✉" },
    ],
  },
  {
    group: "회원",
    icon: "◉",
    items: [
      { href: "/members", label: "회원 목록", icon: "◉" },
      { href: "/members/online", label: "현재 접속자", icon: "●" },
      { href: "/members/blocked", label: "제재 회원", icon: "🚫" },
    ],
  },
  {
    group: "내역",
    icon: "◆",
    items: [
      { href: "/betting", label: "배팅내역", icon: "◆" },
      {
        href: "/history/money",
        label: "머니 이동내역",
        icon: "⊡",
        sectionTitle: "머니 · 포인트",
        nested: true,
      },
      { href: "/history/point", label: "포인트 이동내역", icon: "◎", nested: true },
      {
        href: "/betting/casino",
        label: "카지노",
        icon: "🃏",
        sectionTitle: "종목별 배팅",
      },
      { href: "/betting/slot", label: "슬롯", icon: "🎰" },
      { href: "/betting/sports", label: "스포츠", icon: "⚽" },
      { href: "/betting/powerball-bets", label: "파워볼", icon: "⚡" },
      { href: "/audit", label: "감사 로그", icon: "📋" },
    ],
  },
  {
    group: "운영 · 연락",
    icon: "✦",
    items: [
      { href: "/messages", label: "쪽지 발송", icon: "💬" },
      { href: "/popups", label: "플레이어 팝업", icon: "⊞" },
      { href: "/support", label: "고객센터 (1:1)", icon: "✉" },
    ],
  },
  {
    group: "시스템",
    icon: "◇",
    items: [{ href: "/system", label: "시스템", icon: "◈" }],
  },
  {
    group: "설정",
    icon: "⚙",
    items: [
      { href: "/settings", label: "내 정보 · 설정", icon: "⚙" },
      { href: "/settings/site-policy", label: "사이트 운영 정책", icon: "◇" },
      { href: "/settings/vendor-gates", label: "게임사 제한", icon: "🎰" },
      { href: "/settings/admin-ips", label: "어드민 허용 IP", icon: "⛨" },
      { href: "/settings/bet-limits", label: "배팅 한도 (종목별)", icon: "⊔" },
    ],
  },
];

function filterNavForToto(groups: NavGroup[], totoOn: boolean): NavGroup[] {
  if (totoOn) return groups;
  return groups.map((g) => {
    if (g.group === "게임 관리") {
      return { ...g, items: g.items.filter((i) => i.href !== "/league-hub" && i.href !== "/toto") };
    }
    if (g.group === "내역") {
      return { ...g, items: g.items.filter((i) => i.href !== "/betting/sports") };
    }
    return g;
  });
}

/** 슈퍼가 켠 하부 관리자(파트너) — 게임/시스템·일부 운영 메뉴 숨김, 설정은 비밀번호만 */
function filterNavForPartnerLimited(groups: NavGroup[], limited: boolean): NavGroup[] {
  if (!limited) return groups;
  const dropGroups = new Set(["게임 관리", "시스템"]);
  const dropHrefs = new Set([
    "/agents/create",
    "/rolling",
    "/audit",
    "/messages",
    "/popups",
  ]);
  return groups
    .filter((g) => !dropGroups.has(g.group))
    .map((g) => {
      if (g.group === "설정") {
        return { ...g, items: g.items.filter((i) => i.href === "/settings") };
      }
      return { ...g, items: g.items.filter((i) => !dropHrefs.has(i.href)) };
    });
}

export function DesktopSidebar() {
  const pathname = usePathname();
  const collapsed = useAdminUiStore((s) => s.sidebarCollapsed);
  const totoOn = useAuthStore((s) => s.site?.is_toto_enabled === true);
  /** 슈퍼가 켠 제한 모드 + 요율로 들어온 플레이어(하부 파트너) — 동일 좁은 메뉴 */
  const partnerLimited = useAuthStore(
    (s) => s.user?.admin_partner_limited_ui === true || s.user?.role === "player",
  );
  const isSuperAdmin = useAuthStore((s) => s.user?.role === "super_admin");

  const groups = useMemo(() => {
    let g = filterNavForPartnerLimited(filterNavForToto(NAV_GROUPS_BASE, totoOn), partnerLimited);
    if (isSuperAdmin) {
      g = g.map((grp) => {
        if (grp.group === "입출금") {
          return {
            ...grp,
            items: [
              { href: "/cash", label: "입출금 콘솔 (처리)", icon: "⚡" },
              ...grp.items,
            ],
          };
        }
        return grp;
      });
    }
    return g;
  }, [totoOn, partnerLimited, isSuperAdmin]);
  const allHrefs = useMemo(() => groups.flatMap((g) => g.items.map((i) => i.href)), [groups]);

  const getDefaultOpen = () => {
    const set = new Set<string>();
    const best = activeNavHref(pathname, allHrefs);
    for (const g of groups) {
      if (g.items.some((i) => i.href === best)) set.add(g.group);
    }
    if (set.size === 0) set.add("수익 관련");
    return set;
  };

  const [openGroups, setOpenGroups] = useState<Set<string>>(getDefaultOpen);

  useEffect(() => {
    const best = activeNavHref(pathname, allHrefs);
    if (!best) return;
    for (const g of groups) {
      if (g.items.some((i) => i.href === best)) {
        setOpenGroups((prev) => new Set(prev).add(g.group));
        return;
      }
    }
  }, [pathname, allHrefs, groups]);

  function toggleGroup(group: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function itemActive(href: string) {
    return isNavItemActive(pathname, href, allHrefs);
  }

  return (
    <aside
      className={`hidden shrink-0 flex-col transition-all duration-300 lg:flex ${
        collapsed ? "lg:w-16" : "lg:w-64"
      }`}
      style={{
        background: "linear-gradient(180deg, #0f172a 0%, #0c1222 55%, #0f172a 100%)",
        borderRight: "1px solid rgba(148,163,184,0.14)",
        boxShadow: "4px 0 28px rgba(0,0,0,0.45), inset -1px 0 0 rgba(56,189,248,0.05)",
      }}
    >
      <div
        className="flex h-16 shrink-0 items-center border-b px-4"
        style={{ borderColor: "rgba(212,175,55,0.12)" }}
      >
        {!collapsed ? (
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{
                background: "linear-gradient(135deg, #d4af37, #8a7530)",
                boxShadow: "0 0 16px rgba(212,175,55,0.4)",
              }}
            >
              <span className="text-sm font-bold text-slate-950">S</span>
            </div>
            <div>
              <p
                className="text-base font-semibold tracking-wider"
                style={{ color: "#d4af37", fontFamily: "'Cormorant Garamond', serif" }}
              >
                SLOTPASS
              </p>
              <p className="text-[9px] font-medium uppercase tracking-[0.25em] text-slate-500">
                Partner Console
              </p>
            </div>
          </div>
        ) : (
          <div
            className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              background: "linear-gradient(135deg, #d4af37, #8a7530)",
              boxShadow: "0 0 16px rgba(212,175,55,0.4)",
            }}
          >
            <span className="text-sm font-bold text-slate-950">S</span>
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto py-2">
        {groups.map((group) => {
          const isOpen = openGroups.has(group.group);
          const hasActive = group.items.some((i) => itemActive(i.href));

          if (collapsed) {
            return (
              <div key={group.group} className="px-2 py-0.5">
                {group.items.map((item) => {
                  const active = itemActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      className="flex h-9 w-full items-center justify-center rounded-xl transition-all"
                      style={
                        active
                          ? {
                              background: "linear-gradient(135deg, #d4af37, #c49b2e)",
                              boxShadow: "0 0 16px rgba(212,175,55,0.3)",
                            }
                          : {}
                      }
                    >
                      <span
                        className={`text-sm ${active ? "text-slate-900" : "text-slate-400 hover:text-premium"}`}
                      >
                        {item.icon}
                      </span>
                    </Link>
                  );
                })}
              </div>
            );
          }

          return (
            <div key={group.group} className="px-2">
              <button
                type="button"
                onClick={() => toggleGroup(group.group)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-all ${
                  hasActive ? "text-premium" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${hasActive ? "text-premium" : "text-slate-500"}`}>{group.icon}</span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-200">
                    {group.group}
                  </span>
                </div>
                <span
                  className="text-[10px] text-slate-500 transition-transform duration-200"
                  style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
                >
                  ▶
                </span>
              </button>

              {isOpen && (
                <div
                  className="mb-1 ml-2 space-y-0.5 border-l pl-2"
                  style={{
                    borderColor: hasActive ? "rgba(212,175,55,0.25)" : "rgba(71,85,105,0.5)",
                  }}
                >
                  {group.items.map((item) => {
                    const active = itemActive(item.href);
                    const nested = Boolean(item.nested);
                    return (
                      <Fragment key={item.href}>
                        {item.sectionTitle && (
                          <div
                            className="mb-1 mt-2 border-t border-slate-600/35 px-3 pt-2.5"
                            aria-hidden
                          >
                            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                              {item.sectionTitle}
                            </span>
                          </div>
                        )}
                        <Link
                          href={item.href}
                          className={`group relative flex items-center gap-2.5 rounded-xl py-2.5 text-sm transition-all duration-200 ${
                            nested ? "ml-0.5 border-l-2 border-amber-500/35 pl-2.5 pr-3" : "px-3"
                          } ${nested && !active ? "bg-slate-950/50" : ""} ${
                            active ? "text-slate-900" : "text-slate-200 hover:text-white"
                          }`}
                          style={
                            active
                              ? {
                                  background: "linear-gradient(135deg, #d4af37 0%, #c49b2e 100%)",
                                  boxShadow:
                                    "0 0 16px rgba(212,175,55,0.3), inset 0 1px 0 rgba(255,255,255,0.12)",
                                }
                              : {}
                          }
                        >
                          {!active && (
                            <span
                              className="absolute inset-0 rounded-xl opacity-0 transition-opacity group-hover:opacity-100"
                              style={{ background: "rgba(212,175,55,0.08)" }}
                            />
                          )}
                          <span
                            className={`relative shrink-0 text-sm ${active ? "text-slate-900" : "text-slate-400 group-hover:text-premium"}`}
                          >
                            {item.icon}
                          </span>
                          <span
                            className={`relative truncate text-[13px] font-medium leading-snug tracking-wide ${nested ? "text-[12.5px]" : ""} ${active ? "text-slate-900" : ""}`}
                          >
                            {item.label}
                          </span>
                        </Link>
                      </Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="border-t p-3" style={{ borderColor: "rgba(212,175,55,0.08)" }}>
          <p className="text-center text-[10px] tracking-widest text-slate-600">
            Hermès Skin · v2.2
          </p>
        </div>
      )}
    </aside>
  );
}
