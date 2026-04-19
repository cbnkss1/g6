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
        background: "rgba(6,11,20,0.97)",
        borderTop: "1px solid rgba(212,175,55,0.12)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 -4px 32px rgba(0,0,0,0.6), 0 -1px 0 rgba(212,175,55,0.08)",
      }}
      aria-label="하단 메뉴"
    >
      <ul className="grid h-[60px] grid-cols-6 items-stretch">
        {BOTTOM_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href} className="relative flex flex-1">
              <Link
                href={item.href}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 transition-all ${
                  active ? "text-premium" : "text-slate-600 hover:text-slate-300"
                }`}
              >
                {active && (
                  <span
                    className="absolute top-0 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full"
                    style={{
                      background: "linear-gradient(90deg, transparent, #d4af37, transparent)",
                    }}
                  />
                )}
                <span
                  className={`text-lg leading-none transition-transform ${active ? "scale-110" : ""}`}
                  aria-hidden
                >
                  {item.icon}
                </span>
                <span
                  className={`text-[9px] font-medium tracking-wide ${active ? "text-premium" : "text-slate-400"}`}
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
