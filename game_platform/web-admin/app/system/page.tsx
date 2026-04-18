import { SystemToolsClient } from "./SystemToolsClient";

export default function SystemPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">시스템 · 고객 연락</h2>
        <p className="mt-1 text-sm text-slate-500">
          회원 쪽지 발송과 플레이어 화면 팝업을 여기서 설정합니다.
        </p>
      </div>
      <SystemToolsClient />
    </div>
  );
}
