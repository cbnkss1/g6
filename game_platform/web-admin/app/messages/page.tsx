import Link from "next/link";

export default function MessagesPage() {
  return (
    <div className="glass-card-sm max-w-lg space-y-4 p-6">
      <h1 className="text-lg font-semibold text-slate-100">쪽지</h1>
      <p className="text-sm text-slate-400">
        플랫폼 내 쪽지 발송·수신 기능은 아직 API와 연결되지 않았습니다. 긴급 연락은 외부 채널을 사용해 주세요.
      </p>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/members" className="text-premium hover:underline">
          회원 목록
        </Link>
        <span className="text-slate-600">·</span>
        <Link href="/cash" className="text-premium hover:underline">
          입출금
        </Link>
      </div>
    </div>
  );
}
