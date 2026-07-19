import type { Metadata } from "next";
import StatusShell from "../status-shell";

export const metadata: Metadata = {
  title: "Unsubscribed",
  robots: { index: false },
};

const MESSAGES: Record<string, { heading: string; body: string }> = {
  ok: {
    heading: "You're unsubscribed",
    body: "You won't get any more filing alerts. You can re-subscribe anytime from the site.",
  },
  invalid: {
    heading: "That link didn't work",
    body: "The unsubscribe link is invalid. If you're still getting emails, reply to one or email trevorbrown.web@gmail.com and I'll remove you.",
  },
  error: {
    heading: "Something went wrong",
    body: "We couldn't process that just now. Please try again, or email trevorbrown.web@gmail.com.",
  },
};

export default async function UnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const msg = MESSAGES[status ?? "ok"] ?? MESSAGES.ok;

  return <StatusShell heading={msg.heading} body={msg.body} />;
}
