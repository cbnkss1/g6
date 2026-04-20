import type { Metadata } from "next";

import { ImportantGameBlockOverlay } from "@/components/ImportantGameBlockOverlay";
import { PlayerAuthProvider } from "@/components/PlayerAuthProvider";
import { PlayerInboxRealtime } from "@/components/PlayerInboxRealtime";
import { SitePopupHost } from "@/components/SitePopupHost";
import { NotificationBlockProvider } from "@/lib/notificationBlockContext";
import "./globals.css";

const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");

export const metadata: Metadata = {
  title: "SLOTPASS",
  description: "SLOTPASS — 플레이어",
  ...(site
    ? {
        metadataBase: new URL(site.startsWith("http") ? site : `https://${site}`),
      }
    : {}),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <PlayerAuthProvider>
          <NotificationBlockProvider>
            {children}
            <PlayerInboxRealtime />
            <ImportantGameBlockOverlay />
            <SitePopupHost />
          </NotificationBlockProvider>
        </PlayerAuthProvider>
      </body>
    </html>
  );
}
