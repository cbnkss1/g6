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
};

export default nextConfig;
