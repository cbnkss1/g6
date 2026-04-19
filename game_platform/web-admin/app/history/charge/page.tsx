import { CashHistoryTablePage } from "@/components/admin/CashHistoryTablePage";

export default function HistoryChargePage() {
  return (
    <CashHistoryTablePage
      requestType="DEPOSIT"
      title="최근 충전 내역"
      description="입금(충전) 신청만 최근순으로 표시합니다."
    />
  );
}
