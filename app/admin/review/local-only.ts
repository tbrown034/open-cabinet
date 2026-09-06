import { headers } from "next/headers";
import { notFound } from "next/navigation";

/** Check the actual Host, including on direct server-action submissions. */
export async function requireLocalReview(): Promise<void> {
  const host = (await headers()).get("host") ?? "";
  if (!/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/i.test(host)) notFound();
}
