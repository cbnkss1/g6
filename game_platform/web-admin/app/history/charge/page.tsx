import { redirect } from "next/navigation";

export default function HistoryChargeRedirectPage() {
  redirect("/cash?request_type=DEPOSIT");
}
