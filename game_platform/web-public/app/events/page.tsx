"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { PlainArticle } from "@/components/PlainArticle";
import { SiteHeader } from "@/components/SiteHeader";
import { usePlayerAuth } from "@/lib/playerAuthContext";
import { fetchPlayerPublicPages } from "@/lib/playerPortal";

export default function EventsPage() {
  const { user } = usePlayerAuth();
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setErr(null);
      try {
        const d = await fetchPlayerPublicPages(user?.site_id ?? null);
        if (!cancel) setBody(d.pages.events);
      } catch (e) {
        if (!cancel) setErr(e instanceof Error ? e.message : "로드 실패");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [user?.site_id]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {err ? (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {err}
          </p>
        ) : null}
        <PlainArticle title="이벤트" body={body} />
        <p className="mt-8 text-center">
          <Link href="/" className="text-sm text-premium hover:underline">
            메인으로
          </Link>
        </p>
      </main>
    </div>
  );
}
