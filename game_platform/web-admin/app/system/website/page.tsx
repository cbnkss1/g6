import { redirect } from "next/navigation";

/** 예전 북마크 호환 — 삭제된 전용 페이지 대신 시스템으로 이동 */
export default function SystemWebsiteLegacyRedirectPage() {
  redirect("/system");
}
