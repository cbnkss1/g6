"use client";

import { usePathname } from "next/navigation";
import { AdminDevToolsHardening } from "@/components/admin/AdminDevToolsHardening";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AuthGate } from "@/components/admin/AuthGate";

type Props = { children: React.ReactNode };

/** `/login`, `/login/` 등 — 로그인만 레이아웃·AuthGate 없이 렌더 (미매칭 시 AuthGate가 null → 흰 화면) */
function isLoginRoute(pathname: string | null): boolean {
  if (pathname == null) return false;
  const base = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  return base === "/login";
}

export function ConditionalAdminShell({ children }: Props) {
  const pathname = usePathname();
  if (isLoginRoute(pathname)) {
    return <>{children}</>;
  }
  return (
    <AuthGate>
      <AdminDevToolsHardening />
      <AdminLayout>{children}</AdminLayout>
    </AuthGate>
  );
}
