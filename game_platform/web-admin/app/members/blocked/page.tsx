import { MembersListClient } from "@/components/admin/MembersListClient";

export default function MembersBlockedPage() {
  return (
    <MembersListClient
      title="제재 회원"
      subtitle="비활성(is_active=false) 계정만 기본 표시합니다. 필요 시 상단 필터를 바꿀 수 있습니다."
      initialIsActive={false}
      variant="blocked"
    />
  );
}
