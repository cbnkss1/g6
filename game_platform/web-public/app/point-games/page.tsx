import { redirect } from "next/navigation";

/** 예전 경로 호환: 미니게임 메뉴는 플랫폼 파워볼로 통일 */
export default function PointGamesRedirectPage() {
  redirect("/powerball");
}
