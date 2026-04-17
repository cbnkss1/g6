import { redirect } from "next/navigation";

export default function HistoryExchangeRedirectPage() {
  redirect("/cash?request_type=WITHDRAW");
}
