/** `next start` 시점 환경변수. test.slotpass.net 등에서 /gp-api 가 멈추면 백엔드 주소를 맞출 것. */
const apiProxyTarget = (
  process.env.API_PROXY_TARGET || "http://127.0.0.1:8100"
).replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  /** 일부 CDN이 `/_next/static/.../game-providers/` 청크를 400 처리 → 경로 변경 */
  async redirects() {
    return [
      {
        source: "/settings/game-providers",
        destination: "/settings/vendor-gates",
        permanent: false,
      },
      {
        source: "/settings/game-providers/",
        destination: "/settings/vendor-gates",
        permanent: false,
      },
      { source: "/sports", destination: "/league-hub", permanent: false },
      { source: "/sports/", destination: "/league-hub", permanent: false },
      {
        source: "/sports/odds-live",
        destination: "/league-hub/odds-live",
        permanent: false,
      },
      {
        source: "/sports/odds-live/",
        destination: "/league-hub/odds-live",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/gp-api/:path*",
        destination: `${apiProxyTarget}/:path*`,
      },
      {
        source: "/op-api/:path*",
        destination: `${apiProxyTarget}/:path*`,
      },
    ];
  },
  /** middleware 대신 설정으로 HTML·페이지 no-store (정적 청크·이미지·css/js 확장자 제외) */
  async headers() {
    return [
      {
        source:
          "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
