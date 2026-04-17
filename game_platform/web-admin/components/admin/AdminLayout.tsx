import { AdminHeader } from "@/components/admin/AdminHeader";
import { DesktopSidebar } from "@/components/admin/DesktopSidebar";
import { MobileBottomNav } from "@/components/admin/MobileBottomNav";

type Props = { children: React.ReactNode };

/**
 * 모바일 퍼스트: sm/md/lg 브레이크포인트에서 사이드바·본문 배치 전환.
 * 본문은 하단 네비 높이만큼 pb 확보.
 */
export function AdminLayout({ children }: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 lg:flex-row">
      <DesktopSidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col pb-20 lg:pb-0">
        <AdminHeader />
        <main className="flex-1 px-4 py-4 sm:px-6">{children}</main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
