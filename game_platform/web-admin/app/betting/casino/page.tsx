import { redirect } from "next/navigation";

export default function BettingCasinoRedirectPage() {
  redirect("/betting?game_type=BACCARAT");
}
