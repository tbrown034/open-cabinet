/**
 * Unsubscribe endpoint (POST-only mutation). Two kinds of POST arrive here, and
 * they need different responses:
 *
 *  - RFC 8058 one-click: the mail client (Gmail/Apple "Unsubscribe") POSTs a
 *    form body `List-Unsubscribe=One-Click`. It is UNAUTHENTICATED (the provider
 *    acts on the user's behalf) and expects a 200 with an empty body. It must
 *    NEVER 5xx and NEVER redirect.
 *  - Interstitial form: the human clicked "Unsubscribe" on the /alerts/unsubscribe
 *    page. That POST has no one-click marker; we 303-redirect to the status page.
 *
 * GET is defensive only: mail scanners prefetch links, so a GET must never
 * mutate — it just bounces to the interstitial page.
 *
 * Token is an HMAC verified statelessly; unsubscribe tokens never expire.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { alertSignups } from "@/lib/schema";
import { verifyToken } from "@/lib/tokens";
import { siteUrl } from "@/lib/email-config";

async function unsubscribe(id: number): Promise<void> {
  await db
    .update(alertSignups)
    .set({
      status: "unsubscribed",
      unsubscribedAt: new Date(),
      updatedAt: sql`now()`,
    })
    .where(eq(alertSignups.id, id));
}

// verifyToken throws if ALERT_TOKEN_SECRET is unset. The one-click POST must
// never 5xx, so any config error degrades to an invalid (non-mutating) result.
function safeVerify(token: string): { valid: boolean; id?: number } {
  try {
    return verifyToken(token, "unsubscribe");
  } catch (err) {
    console.error("[alerts/unsubscribe] token verify failed:", err);
    return { valid: false };
  }
}

function pageRedirect(path: string, status = 307) {
  return NextResponse.redirect(new URL(path, siteUrl()), status);
}

export async function GET(req: NextRequest) {
  // Defensive: never mutate on a GET (scanners prefetch these). Send the human
  // to the interstitial page, where an explicit POST performs the unsubscribe.
  const token = req.nextUrl.searchParams.get("token") ?? "";
  return pageRedirect(`/alerts/unsubscribe?token=${encodeURIComponent(token)}`);
}

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";

  // Detect RFC 8058 one-click by its form-body marker. Reading the body is
  // wrapped because a missing/oddly-encoded body must not throw here.
  let oneClick = false;
  try {
    const form = await req.formData();
    oneClick = form.get("List-Unsubscribe") === "One-Click";
  } catch {
    // No parseable body — treat as an interstitial form submit.
  }

  const { valid, id } = safeVerify(token);

  if (oneClick) {
    if (valid && id !== undefined) {
      try {
        await unsubscribe(id);
      } catch (err) {
        console.error("[alerts/unsubscribe] one-click failed:", err);
      }
    }
    // Always 200 with empty body per RFC 8058 — never error back to the provider.
    return new NextResponse(null, { status: 200 });
  }

  // Interstitial form submit: 303 so a refresh of the result doesn't re-POST.
  if (!valid || id === undefined) {
    return pageRedirect("/alerts/unsubscribed?status=invalid", 303);
  }
  try {
    await unsubscribe(id);
    return pageRedirect("/alerts/unsubscribed?status=ok", 303);
  } catch (err) {
    console.error("[alerts/unsubscribe] POST failed:", err);
    return pageRedirect("/alerts/unsubscribed?status=error", 303);
  }
}
