import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * HTML·RSC 응답에 강한 no-store — 옛 빌드의 chunk 목록이 브라우저/CDN에 남아
 * 메뉴 이동 시 `Cannot find module './NNN.js'` 처럼 보이는 불일치를 줄임.
 * `/_next/static` 등 정적 자산은 matcher 에서 제외.
 */
export function middleware(request: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return res;
}

export const config = {
  matcher: [
    "/",
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
