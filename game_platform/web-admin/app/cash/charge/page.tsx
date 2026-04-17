import { redirect } from "next/navigation";

export default function CashChargeRedirectPage() {
  redirect("/cash?request_type=DEPOSIT&status=PENDING");
}
