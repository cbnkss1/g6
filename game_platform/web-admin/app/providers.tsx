"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AdminRealtimeBridge } from "@/components/admin/AdminRealtimeBridge";
import { SiteConfigSync } from "@/components/admin/SiteConfigSync";
import { SuperOpsToastLayer } from "@/components/admin/SuperOpsToastLayer";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={client}>
      <SiteConfigSync />
      <AdminRealtimeBridge />
      <SuperOpsToastLayer />
      {children}
    </QueryClientProvider>
  );
}
