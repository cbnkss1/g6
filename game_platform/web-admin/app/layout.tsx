import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ConditionalAdminShell } from "@/components/admin/ConditionalAdminShell";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-geist-sans" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Game Platform Admin",
  description: "B2B 카지노 솔루션 어드민",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`dark ${inter.variable} ${jetbrains.variable}`}>
      <body className="font-sans">
        <Providers>
          <ConditionalAdminShell>{children}</ConditionalAdminShell>
        </Providers>
      </body>
    </html>
  );
}
