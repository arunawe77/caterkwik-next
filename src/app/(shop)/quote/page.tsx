import { redirect } from "next/navigation";

export default function QuoteIndex() {
  redirect("/quote/new");
}
