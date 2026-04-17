"use client";

import { usePathname } from "next/navigation";
import { AdminDevToolsHardening } from "@/components/admin/AdminDevToolsHardening";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AuthGate } from "@/components/admin/AuthGate";

type Props = { children: React.ReactNode };

export function ConditionalAdminShell({ children }: Props) {
  const pathname = usePathname();
  if (pathname === "/login") {
    return <>{children}</>;
  }
  return (
    <AuthGate>
      <AdminDevToolsHardening />
      <AdminLayout>{children}</AdminLayout>
    </AuthGate>
  );
}
