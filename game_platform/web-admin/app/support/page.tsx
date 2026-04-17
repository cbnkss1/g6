import Link from "next/link";

export default function SupportPage() {
  return (
    <div className="glass-card-sm max-w-lg space-y-4 p-6">
      <h1 className="text-lg font-semibold text-slate-100">고객센터</h1>
      <p className="text-sm text-slate-400">
        티켓·1:1 문의 백오피스는 추후 연동 예정입니다. 운영 중 회원·입출금 처리는 아래 메뉴를 이용하세요.
      </p>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/members" className="text-premium hover:underline">
          회원
        </Link>
        <Link href="/cash" className="text-premium hover:underline">
          입출금
        </Link>
        <Link href="/betting" className="text-premium hover:underline">
          배팅 로그
        </Link>
        <Link href="/audit" className="text-premium hover:underline">
          감사 로그
        </Link>
      </div>
    </div>
  );
}
