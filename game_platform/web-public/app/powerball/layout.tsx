/** 파워볼 HTML이 CDN/브라우저에 오래 캐시되면 옛 UI(라이브 URL 미설정 등)가 남을 수 있어 동적 라우트로 고정 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function PowerballLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
