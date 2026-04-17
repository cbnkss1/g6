import { redirect } from "next/navigation";

export default function BettingSlotRedirectPage() {
  redirect("/betting?game_type=SLOT");
}
