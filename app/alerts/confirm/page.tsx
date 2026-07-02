import type { Metadata } from "next";
import StatusShell from "../status-shell";
import { verifyToken } from "@/lib/tokens";

export const metadata: Metadata = {
  title: "Confirm your filing alerts, Open Cabinet",
  robots: { index: false },
};

/**
 * Interstitial confirmation page. The confirmation email links here (a GET),
 * NOT to the API route — because mail scanners (Outlook SafeLinks, Mimecast)
 * prefetch GET links, and auto-confirming on prefetch would defeat double
 * opt-in. The actual mutation only happens when the human clicks the button,
 * which POSTs to the API route.
 */

// verifyToken throws if ALERT_TOKEN_SECRET is unset; degrade to "invalid".
function tokenValid(token: string): boolean {
  try {
    return verifyToken(token, "confirm").valid;
  } catch {
    return false;
  }
}

export default async function ConfirmInterstitialPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token || !tokenValid(token)) {
    return (
      <StatusShell
        heading="That link didn't work"
        body="This confirmation link is invalid or has expired. Sign up again from any page to get a fresh one."
      />
    );
  }

  return (
    <StatusShell
      heading="Confirm your filing alerts"
      body="One more step: confirm you want an email when executive-branch officials report new stock trades."
    >
      <form
        method="POST"
        action={`/api/alerts/confirm?token=${encodeURIComponent(token)}`}
        className="mb-8"
      >
        <button
          type="submit"
          className="bg-neutral-900 text-white px-4 py-2 text-sm hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          Confirm subscription
        </button>
      </form>
    </StatusShell>
  );
}
