import type { Metadata } from "next";
import StatusShell from "../status-shell";
import { verifyToken } from "@/lib/tokens";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false },
};

/**
 * Interstitial unsubscribe page. Footer unsubscribe links in emails point here
 * (a GET), NOT at the API route — mail scanners prefetch GET links, and
 * auto-unsubscribing on prefetch would silently drop real subscribers. The
 * mutation only happens when the human clicks the button, which POSTs to the
 * API route. (The RFC 8058 one-click header still targets the API route
 * directly for providers that POST it.)
 */

// verifyToken throws if ALERT_TOKEN_SECRET is unset; degrade to "invalid".
function tokenValid(token: string): boolean {
  try {
    return verifyToken(token, "unsubscribe").valid;
  } catch {
    return false;
  }
}

export default async function UnsubscribeInterstitialPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token || !tokenValid(token)) {
    return (
      <StatusShell
        heading="That link didn't work"
        body="This unsubscribe link is invalid. If you're still getting emails, reply to one or email trevorbrown.web@gmail.com and I'll remove you."
      />
    );
  }

  return (
    <StatusShell
      heading="Unsubscribe from filing alerts"
      body="Confirm you want to stop receiving Open Cabinet filing alerts. You can re-subscribe anytime from the site."
    >
      <form
        method="POST"
        action={`/api/alerts/unsubscribe?token=${encodeURIComponent(token)}`}
        className="mb-8"
      >
        <button
          type="submit"
          className="bg-neutral-900 text-white px-4 py-2 text-sm hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          Unsubscribe
        </button>
      </form>
    </StatusShell>
  );
}
