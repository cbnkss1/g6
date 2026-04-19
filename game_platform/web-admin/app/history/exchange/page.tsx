import { CashHistoryTablePage } from "@/components/admin/CashHistoryTablePage";

export default function HistoryExchangePage() {
  return (
    <CashHistoryTablePage
      requestType="WITHDRAW"
      title="최근 환전 내역"
      description="출금(환전) 신청만 최근순으로 표시합니다."
    />
  );
}
