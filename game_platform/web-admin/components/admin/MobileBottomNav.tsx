"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { isNavItemActive } from "@/lib/navActive";

const BOTTOM_ITEMS = [
  { href: "/", label: "홈", icon: "◈" },
  { href: "/cash/request", label: "입출금", icon: "$" },
  { href: "/betting", label: "배팅", icon: "◆" },
  { href: "/agents", label: "트리", icon: "▦" },
  { href: "/members", label: "회원", icon: "◉" },
  { href: "/settings", label: "설정", icon: "⚙" },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const hrefs = useMemo(() => BOTTOM_ITEMS.map((i) => i.href), []);

  function isActive(href: string) {
    return isNavItemActive(pathname, href, hrefs);
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 pb-[env(safe-area-inset-bottom)] lg:hidden"
      style={{
        background: "linear-gradient(180deg, rgba(30,41,59,0.92) 0%, rgba(15,23,42,0.96) 100%)",
        borderTop: "1px solid rgba(212,175,55,0.28)",
        backdropFilter: "blur(16px)",
        boxShadow:
          "0 -8px 40px rgba(0,0,0,0.45), 0 -1px 0 rgba(212,175,55,0.15), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
      aria-label="하단 메뉴"
    >
      <ul className="grid min-h-[64px] grid-cols-6 items-stretch py-1">
        {BOTTOM_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href} className="relative flex flex-1">
              <Link
                href={item.href}
                className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 transition-all active:scale-[0.98] ${
                  active
                    ? "text-amber-200"
                    : "text-slate-200 hover:bg-white/5 hover:text-white"
                }`}
              >
                {active && (
                  <span
                    className="absolute top-0.5 left-1/2 h-0.5 w-7 -translate-x-1/2 rounded-full shadow-[0_0_12px_rgba(212,175,55,0.6)]"
                    style={{
                      background: "linear-gradient(90deg, transparent, #f5d78a, #d4af37, #f5d78a, transparent)",
                    }}
                  />
                )}
                <span
                  className={`text-[17px] leading-none transition-transform drop-shadow-sm ${
                    active ? "scale-110 text-amber-200" : "text-slate-300"
                  }`}
                  aria-hidden
                >
                  {item.icon}
                </span>
                <span
                  className={`text-[10px] font-semibold tracking-wide ${
                    active ? "text-amber-100" : "text-slate-200"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
