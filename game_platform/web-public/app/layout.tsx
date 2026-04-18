import type { Metadata } from "next";

import { PlayerAuthProvider } from "@/components/PlayerAuthProvider";
import { SitePopupHost } from "@/components/SitePopupHost";
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
          {children}
          <SitePopupHost />
        </PlayerAuthProvider>
      </body>
    </html>
  );
}
