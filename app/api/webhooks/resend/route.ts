/**
 * Resend webhook — auto-suppress bounces and complaints.
 *
 * When an address hard-bounces or someone marks our mail as spam, we must stop
 * sending to them or our domain reputation tanks. Resend POSTs those events
 * here; we flip the subscriber to "suppressed" so they're never mailed again.
 *
 * Verification: Resend signs webhooks with svix. We MUST verify against the RAW
 * request body (re-stringified JSON breaks the signature), so we read req.text()
 * and hand it to the svix Webhook verifier with the three svix-* headers.
 *
 * Idempotency: handlers are naturally idempotent (suppressing an already-
 * suppressed row, or re-marking an emailSends status, is a no-op), so duplicate
 * deliveries (Resend is at-least-once) are harmless without a separate svix-id
 * ledger.
 */
import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { and, eq, ne } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { alertSignups, emailSends } from "@/lib/schema";

interface ResendEvent {
  type: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
  };
}

function recipients(data: ResendEvent["data"]): string[] {
  if (!data?.to) return [];
  return (Array.isArray(data.to) ? data.to : [data.to]).map((e) =>
    e.toLowerCase()
  );
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhooks/resend] RESEND_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  // Raw body is required for signature verification.
  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let event: ResendEvent;
  try {
    event = new Webhook(secret).verify(payload, headers) as ResendEvent;
  } catch (err) {
    console.warn("[webhooks/resend] signature verification failed:", (err as Error).message);
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // Bounces/complaints carry reputation/legal weight — if the DB write fails we
  // want Resend to RETRY (non-200), not silently lose the event.
  const critical =
    event.type === "email.bounced" || event.type === "email.complained";

  try {
    const messageId = event.data?.email_id;
    const emails = recipients(event.data);

    switch (event.type) {
      case "email.bounced":
      case "email.complained": {
        const reason = event.type === "email.bounced" ? "bounce" : "complaint";
        // Suppress the subscriber so they're never mailed again. Don't override
        // an explicit unsubscribe (also a do-not-send state).
        for (const email of emails) {
          const updated = await db
            .update(alertSignups)
            .set({ status: "suppressed", suppressedReason: reason, updatedAt: sql`now()` })
            .where(and(eq(alertSignups.email, email), ne(alertSignups.status, "unsubscribed")))
            .returning({ id: alertSignups.id });
          if (updated.length === 0) {
            console.warn(
              `[webhooks/resend] ${event.type} for ${email} matched no active subscriber (already suppressed/unsubscribed, or unknown address).`
            );
          }
        }
        if (messageId) {
          await db
            .update(emailSends)
            .set({ status: event.type === "email.bounced" ? "bounced" : "complained" })
            .where(eq(emailSends.resendMessageId, messageId));
        }
        break;
      }
      case "email.delivered": {
        if (messageId) {
          await db
            .update(emailSends)
            .set({ status: "delivered" })
            .where(eq(emailSends.resendMessageId, messageId));
        }
        break;
      }
      // email.delivery_delayed is transient — do NOT suppress. Other events ignored.
      default:
        break;
    }
  } catch (err) {
    console.error("[webhooks/resend] handler error:", err);
    if (critical) {
      // Ask Resend to retry rather than lose a bounce/complaint.
      return NextResponse.json({ error: "retry" }, { status: 500 });
    }
    // Non-critical events: ack with 200; idempotent on the next delivery.
  }

  return NextResponse.json({ ok: true });
}
