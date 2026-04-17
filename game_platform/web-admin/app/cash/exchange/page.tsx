import { redirect } from "next/navigation";

export default function CashExchangeRedirectPage() {
  redirect("/cash?request_type=WITHDRAW&status=PENDING");
}
