import Link from "next/link";

/** 스포츠(토토) 배팅은 gp_bet_history.game_type=SPORTS 로 통합 로그에 쌓입니다. */
export default function Page() {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-6 animate-fade-up">
      <p className="text-premium-label">스포츠 · 토토</p>
      <h1 className="text-xl font-semibold text-slate-100">배팅 내역 보는 곳</h1>
      <p className="text-sm text-slate-500">
        회원 웹에서 단폴 베팅 후, 관리자{" "}
        <strong className="text-slate-300">전체 배팅 내역</strong>에서 필터{" "}
        <strong className="text-premium">게임 → 스포츠</strong>를 선택하면 됩니다.
        경기별 상세는 <strong className="text-slate-300">스포츠 정산</strong> 메뉴에서 확인합니다.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/betting"
          className="admin-touch-btn inline-flex min-h-[52px] items-center rounded-xl border border-premium/40 bg-premium/10 px-5 text-sm font-semibold text-premium hover:bg-premium/20"
        >
          전체 배팅 내역
        </Link>
        <Link
          href="/league-hub"
          className="admin-touch-btn inline-flex min-h-[52px] items-center rounded-xl border border-slate-700 px-5 text-sm text-slate-300 hover:border-slate-500"
        >
          스포츠 정산
        </Link>
      </div>
    </div>
  );
}
