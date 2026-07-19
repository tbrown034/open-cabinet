import type { Metadata } from "next";
import StatusShell from "../status-shell";

export const metadata: Metadata = {
  title: "Confirmation",
  robots: { index: false },
};

const MESSAGES: Record<string, { heading: string; body: string }> = {
  ok: {
    heading: "You're confirmed",
    body: "You'll get an email whenever a tracked official reports a new stock trade. Most weeks that's nothing, so expect a quiet inbox.",
  },
  already: {
    heading: "Already confirmed",
    body: "Your email was already on the filing-alert list. Nothing else to do.",
  },
  invalid: {
    heading: "That link didn't work",
    body: "The confirmation link is invalid or has expired. Sign up again from any page to get a fresh one.",
  },
  error: {
    heading: "Something went wrong",
    body: "We couldn't confirm your signup just now. Please try the link again, or email trevorbrown.web@gmail.com.",
  },
};

export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const msg = MESSAGES[status ?? "ok"] ?? MESSAGES.ok;

  return <StatusShell heading={msg.heading} body={msg.body} />;
}
