import { redirect } from "next/navigation";

/** 예전 URL 호환: 지급·회수는 회원 목록에서 처리합니다. */
export default function StaffPermissionsRedirectPage() {
  redirect("/members");
}
