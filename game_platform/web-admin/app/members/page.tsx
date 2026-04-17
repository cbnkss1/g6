import { MembersListClient } from "@/components/admin/MembersListClient";

export default function MembersPage() {
  return (
    <MembersListClient
      title="회원 목록"
      subtitle="내 추천인 체인 안의 회원 전부를 같은 회원으로 조회합니다. 아이디·역할·활성 필터를 사용하세요."
      initialIsActive={null}
      variant="default"
    />
  );
}
