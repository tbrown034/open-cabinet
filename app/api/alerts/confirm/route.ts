/**
 * Double-opt-in confirmation endpoint.
 *
 * The confirmation email links to the /alerts/confirm interstitial PAGE, whose
 * button POSTs here. We DON'T confirm on a bare GET, because mail scanners
 * (Outlook SafeLinks, Mimecast) prefetch GET links and would auto-confirm —
 * defeating double opt-in. So:
 *
 *  - POST = the human clicked "Confirm" on the interstitial. Verify the HMAC
 *    token (stateless — no DB token lookup), flip pending -> active, send the
 *    welcome email, and 303-redirect to the status page.
 *  - GET  = defensive only (a stray prefetch/direct hit). Never mutates; just
 *    bounces to the interstitial page.
 *
 * Idempotent: re-clicking a valid link on an already-active row shows success
 * again. A stale link must NOT resurrect an unsubscribed/suppressed address —
 * that's enforced structurally by the `status = 'pending'` guard on the UPDATE.
 */
import { NextResponse, after } from "next/server";
import type { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { alertSignups } from "@/lib/schema";
import { verifyToken, mintToken } from "@/lib/tokens";
import { unsubscribeUrl, unsubscribePageUrl, siteUrl } from "@/lib/email-config";
import { buildWelcomeEmail } from "@/lib/emails";
import { sendTransactional } from "@/lib/email-send";

function pageRedirect(path: string, status = 303) {
  // 303 forces the browser to GET the status page after our POST, so a refresh
  // of the result page doesn't re-submit the form.
  return NextResponse.redirect(new URL(path, siteUrl()), status);
}

// verifyToken throws if ALERT_TOKEN_SECRET is unset. Wrap so a config error
// degrades to the graceful invalid path instead of a raw 500.
function safeVerify(token: string): { valid: boolean; id?: number } {
  try {
    return verifyToken(token, "confirm");
  } catch (err) {
    console.error("[alerts/confirm] token verify failed:", err);
    return { valid: false };
  }
}

export async function GET(req: NextRequest) {
  // Defensive: never mutate on a GET (scanners prefetch these). Send the human
  // to the interstitial page, where an explicit POST performs the confirm.
  const token = req.nextUrl.searchParams.get("token") ?? "";
  return pageRedirect(`/alerts/confirm?token=${encodeURIComponent(token)}`, 307);
}

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const { valid, id } = safeVerify(token);
  if (!valid || id === undefined) {
    return pageRedirect("/alerts/confirmed?status=invalid");
  }

  try {
    // One conditional UPDATE is the happy path: only a *pending* row becomes
    // active. This structurally preserves the lifecycle edge cases — a dead
    // bounce, a complaint-suppressed row, or an unsubscribed row is not
    // "pending", so a stale confirm link can never resurrect it.
    const [confirmed] = await db
      .update(alertSignups)
      .set({ status: "active", confirmedAt: new Date(), updatedAt: sql`now()` })
      .where(and(eq(alertSignups.id, id), eq(alertSignups.status, "pending")))
      .returning({ email: alertSignups.email });

    if (confirmed) {
      // Welcome mail is best-effort and must not delay the redirect — defer it
      // past the response. Token minting is wrapped so a config error can't 500.
      after(async () => {
        try {
          const unsubToken = mintToken(id, "unsubscribe");
          const welcome = buildWelcomeEmail(unsubscribePageUrl(unsubToken));
          await sendTransactional({
            to: confirmed.email,
            kind: "welcome",
            subject: welcome.subject,
            html: welcome.html,
            text: welcome.text,
            headers: {
              // Human-clickable link is the interstitial page (above); the
              // header targets the API route for RFC 8058 one-click providers.
              "List-Unsubscribe": `<${unsubscribeUrl(unsubToken)}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          });
        } catch (err) {
          console.error("[alerts/confirm] welcome email failed:", err);
        }
      });
      return pageRedirect("/alerts/confirmed?status=ok");
    }

    // Zero rows updated: distinguish an already-active row (idempotent success)
    // from a non-resurrectable one (unsubscribed / suppressed / not found).
    const [row] = await db
      .select({ status: alertSignups.status })
      .from(alertSignups)
      .where(eq(alertSignups.id, id))
      .limit(1);

    if (row?.status === "active") {
      return pageRedirect("/alerts/confirmed?status=already");
    }
    return pageRedirect("/alerts/confirmed?status=invalid");
  } catch (err) {
    console.error("[alerts/confirm] Failed:", err);
    return pageRedirect("/alerts/confirmed?status=error");
  }
}
