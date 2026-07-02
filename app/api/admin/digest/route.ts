/**
 * Admin API: filing-alert digest.
 *
 * GET  — assemble the draft digest (what WOULD be sent), the consent-filtered
 *        recipient count, and any in-flight/last-sent run state, for review in
 *        /admin. Read-only; sends nothing.
 * POST — the human approval gate that actually sends. Models a write-ahead
 *        outbox (digest_runs) so the external Resend call is never assumed
 *        atomic with our DB writes. Hard-gated to production + admin.
 *
 * Lifecycle (POST):
 *   1. guards: admin, production, CAN-SPAM postal address, confirmed recipients
 *   2. buildDigest; empty -> nothing to send
 *   3. idempotencyKey = sha256(sorted un-notified filing URLs)
 *      - existing run "sent"            -> 409 (already sent)
 *      - existing run "sending"/"failed"-> RESUME from its frozen payload
 *      - none                           -> freeze payload, insert "sending"
 *   4. send chunks (skipping any already confirmed), persist chunk state
 *   5. all chunks ok -> ONE atomic db.batch: write notified_filings ledger +
 *      per-recipient email_sends rows + bump recipients' lastNotifiedAt + flip
 *      run to "sent". Then email the admin a receipt.
 *   6. any chunk failed -> persist "failed"; the admin retries (retry = resume).
 *
 * neon-http has no interactive transactions, so the finalize uses db.batch,
 * which runs its statements as a single atomic request.
 */
import { NextResponse } from "next/server";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { alertSignups, digestRuns, emailSends, notifiedFilings } from "@/lib/schema";
import { buildDigest, digestIdempotencyKey } from "@/lib/digest";
import {
  sendDigestBatch,
  type DigestChunkResult,
  type DigestRecipient,
} from "@/lib/email-send";
import { notify } from "@/lib/notify";
import { POSTAL_ADDRESS } from "@/lib/email-config";
import type { DigestItem } from "@/lib/digest";

// Resend's free tier caps at 100 emails/day shared across every send; warn the
// admin before they approach it so a digest isn't silently truncated.
const FREE_TIER_LIMIT = 100;
const FREE_TIER_WARN_AT = 90;
const CHUNK_MAX = 100; // must match sendDigestBatch's BATCH_MAX

/** Immutable send spec frozen into digest_runs.frozenPayload on the first send. */
interface FrozenPayload {
  items: DigestItem[];
  filings: { url: string; slug: string }[];
  recipients: DigestRecipient[];
  key: string;
}

function freeTierWarning(recipientCount: number): string | null {
  return recipientCount > FREE_TIER_WARN_AT
    ? `Resend free tier allows ${FREE_TIER_LIMIT} emails/day across all sends; this digest targets ${recipientCount}.`
    : null;
}

function chunkSummary(chunks: DigestChunkResult[]) {
  return {
    total: chunks.length,
    ok: chunks.filter((c) => c.ok).length,
    failed: chunks.filter((c) => !c.ok).length,
  };
}

/** Merge a resume run's fresh chunk results over previously-persisted ones. */
function mergeChunks(
  prior: DigestChunkResult[],
  next: DigestChunkResult[]
): DigestChunkResult[] {
  const byN = new Map<number, DigestChunkResult>();
  for (const c of prior) byN.set(c.n, c);
  for (const c of next) byN.set(c.n, c); // this run's attempt wins
  return [...byN.values()].sort((a, b) => a.n - b.n);
}

/** Confirmed subscribers only. Legacy never-consented rows are status 'active'
 * with a null confirmedAt — they must be excluded until re-permission stamps
 * confirmedAt via the confirm flow. */
async function loadConfirmedRecipients(): Promise<DigestRecipient[]> {
  return db
    .select({ id: alertSignups.id, email: alertSignups.email })
    .from(alertSignups)
    .where(and(eq(alertSignups.status, "active"), isNotNull(alertSignups.confirmedAt)));
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const draft = await buildDigest();
    const recipients = await loadConfirmedRecipients();
    const recipientCount = recipients.length;

    // Surface any unfinished run (so the admin sees a resume is pending) and the
    // most recent successful send timestamp.
    const [inFlight] = await db
      .select({ id: digestRuns.id, status: digestRuns.status, chunks: digestRuns.chunks })
      .from(digestRuns)
      .where(inArray(digestRuns.status, ["sending", "failed"]))
      .orderBy(desc(digestRuns.createdAt))
      .limit(1);

    const [lastSent] = await db
      .select({ sentAt: digestRuns.sentAt })
      .from(digestRuns)
      .where(eq(digestRuns.status, "sent"))
      .orderBy(desc(digestRuns.sentAt))
      .limit(1);

    return NextResponse.json({
      draft,
      recipientCount,
      production: process.env.VERCEL_ENV === "production",
      inFlightRun: inFlight
        ? {
            id: inFlight.id,
            status: inFlight.status,
            chunks: chunkSummary((inFlight.chunks as DigestChunkResult[] | null) ?? []),
          }
        : null,
      lastSentAt: lastSent?.sentAt ?? null,
      warning: freeTierWarning(recipientCount),
    });
  } catch (err) {
    console.error("[admin/digest] GET failed:", err);
    return NextResponse.json({ error: "Could not assemble digest." }, { status: 500 });
  }
}

export async function POST() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const approvedBy = session.user.email;

  // Hard gate: nothing reaches a real subscriber outside production.
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.json(
      { error: "Sending is disabled outside production." },
      { status: 403 }
    );
  }

  // CAN-SPAM: bulk email must carry a real postal address. Refuse if it's still
  // the placeholder rather than send a non-compliant footer.
  if (POSTAL_ADDRESS === "[MAILING ADDRESS PENDING]") {
    return NextResponse.json(
      { error: "MAIL_POSTAL_ADDRESS is not set — required in the email footer (CAN-SPAM). Set it before sending." },
      { status: 409 }
    );
  }

  try {
    const digest = await buildDigest();
    if (digest.empty) {
      return NextResponse.json({ empty: true });
    }

    const recipients = await loadConfirmedRecipients();
    if (recipients.length === 0) {
      return NextResponse.json({
        status: "no-recipients",
        recipientCount: 0,
        message: "No confirmed recipients yet — nothing sent.",
      });
    }

    const key = digestIdempotencyKey(digest.filingUrls);

    // Look up any existing run for THIS filing set.
    const [existing] = await db
      .select()
      .from(digestRuns)
      .where(eq(digestRuns.idempotencyKey, key))
      .limit(1);

    let runId: number;
    let payload: FrozenPayload;
    let priorChunks: DigestChunkResult[] = [];

    if (existing) {
      if (existing.status === "sent") {
        return NextResponse.json(
          { status: "already-sent", error: "This digest has already been sent.", runId: existing.id },
          { status: 409 }
        );
      }
      // RESUME: reuse the frozen payload byte-for-byte (never rebuild — the
      // underlying data may have changed since the first attempt).
      runId = existing.id;
      payload = existing.frozenPayload as FrozenPayload;
      priorChunks = (existing.chunks as DigestChunkResult[] | null) ?? [];
    } else {
      // Freeze the send spec and open the outbox row before touching Resend.
      payload = {
        items: digest.items,
        filings: digest.filings,
        recipients,
        key,
      };
      const [row] = await db
        .insert(digestRuns)
        .values({
          status: "sending",
          recipientCount: recipients.length,
          idempotencyKey: key,
          frozenPayload: payload,
          chunks: [],
          approvedBy,
          approvedAt: new Date(),
        })
        .returning({ id: digestRuns.id });
      runId = row.id;
    }

    // Send only the chunks not already confirmed on a prior run.
    const doneChunks = priorChunks.filter((c) => c.ok).map((c) => c.n);
    const batch = await sendDigestBatch(payload.recipients, payload.items, key, {
      skipChunks: doneChunks,
    });
    const mergedChunks = mergeChunks(priorChunks, batch.chunks);

    const totalChunks = Math.max(1, Math.ceil(payload.recipients.length / CHUNK_MAX));
    const allOk =
      mergedChunks.length === totalChunks && mergedChunks.every((c) => c.ok);

    if (!batch.ok || !allOk) {
      await db
        .update(digestRuns)
        .set({
          status: "failed",
          chunks: mergedChunks,
          errors: { message: batch.error ?? "One or more chunks failed", at: new Date().toISOString() },
        })
        .where(eq(digestRuns.id, runId));

      return NextResponse.json({
        status: "failed",
        retry: true,
        error: batch.error ?? "Some recipients did not receive the digest.",
        chunks: chunkSummary(mergedChunks),
        message: "Partial send. Click Send again to resume the remaining recipients.",
      });
    }

    // Every chunk confirmed. Commit the ledger, per-recipient audit rows, the
    // recipient recency bumps, and the status flip as ONE atomic batch so we
    // never write the ledger for a send we can't account for.
    const sentRows = mergedChunks.flatMap((c) => c.sent);
    const sentEmails = sentRows.map((r) => r.email);
    const now = new Date();

    await db.batch([
      db
        .insert(notifiedFilings)
        .values(
          payload.filings.map((f) => ({
            filingUrl: f.url,
            officialSlug: f.slug,
            digestRunId: runId,
          }))
        )
        .onConflictDoNothing(),
      db.insert(emailSends).values(
        sentRows.map((r) => ({
          email: r.email,
          kind: "digest",
          digestRunId: runId,
          resendMessageId: r.messageId || null,
          status: "sent",
        }))
      ),
      db
        .update(alertSignups)
        .set({ lastNotifiedAt: now })
        .where(inArray(alertSignups.email, sentEmails)),
      db
        .update(digestRuns)
        .set({ status: "sent", sentAt: now, chunks: mergedChunks, recipientCount: sentRows.length })
        .where(eq(digestRuns.id, runId)),
    ]);

    // Admin receipt (best-effort; a notify failure never fails the send).
    await notify({
      type: "digest_sent",
      headline: `Digest sent — ${sentRows.length} recipient${sentRows.length === 1 ? "" : "s"}, ${payload.filings.length} filing${payload.filings.length === 1 ? "" : "s"}`,
      summary: `Digest run #${runId} delivered to ${sentRows.length} confirmed subscriber${sentRows.length === 1 ? "" : "s"} covering ${payload.items.length} official${payload.items.length === 1 ? "" : "s"}.`,
      metadata: {
        runId,
        recipients: sentRows.length,
        officials: payload.items.length,
        filings: payload.filings.length,
      },
    });

    return NextResponse.json({
      status: "sent",
      runId,
      recipientCount: sentRows.length,
      filingCount: payload.filings.length,
      officialCount: payload.items.length,
      warning: freeTierWarning(sentRows.length),
    });
  } catch (err) {
    console.error("[admin/digest] POST failed:", err);
    return NextResponse.json({ error: "Digest send failed." }, { status: 500 });
  }
}
