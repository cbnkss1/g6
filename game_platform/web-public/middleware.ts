import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** CDN·브라우저가 옛 HTML/JS를 붙잡는 경우 줄이기 (파워볼·스포츠) */
export function middleware(request: NextRequest) {
  const res = NextResponse.next();
  const p = request.nextUrl.pathname;
  if (p === "/powerball" || p.startsWith("/powerball/") || p === "/match-list" || p.startsWith("/match-list/")) {
    res.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  }
  return res;
}

export const config = {
  matcher: ["/powerball", "/powerball/:path*", "/match-list", "/match-list/:path*"],
};
