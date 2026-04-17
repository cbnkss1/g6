/* as.slotpass.net 등 배포 시: API_PROXY_TARGET 을 서버에서 백엔드로 닿는 주소로 (예: http://127.0.0.1:8100) */
const apiProxyTarget = (
  process.env.API_PROXY_TARGET || "http://127.0.0.1:8100"
).replace(/\/$/, "");

const buildStamp =
  process.env.NEXT_PUBLIC_BUILD_STAMP?.trim() ||
  process.env.CI_COMMIT_SHORT_SHA?.trim() ||
  process.env.VERCEL_GIT_COMMIT_SHA?.trim()?.slice(0, 7) ||
  "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    ...(buildStamp ? { NEXT_PUBLIC_BUILD_STAMP: buildStamp } : {}),
  },
  /** 구 URL·북마크 호환. 일부 CDN/WAF가 `/_next/static/.../sports/` 청크 경로를 400 처리함 */
  async redirects() {
    return [
      { source: "/sports", destination: "/match-list", permanent: false },
      { source: "/sports/", destination: "/match-list", permanent: false },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/gp-api/:path*",
        destination: `${apiProxyTarget}/:path*`,
      },
      // 흔한 오타(op-api)도 동일 백엔드로 연결
      {
        source: "/op-api/:path*",
        destination: `${apiProxyTarget}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/powerball",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/match-list",
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
