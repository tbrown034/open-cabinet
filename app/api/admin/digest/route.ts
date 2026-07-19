/**
 * Admin API: filing-alert digest.
 *
 * GET  — assemble the draft digest (what WOULD be sent), the consent-filtered
 *        recipient counts (total / every-filing / major-only), and any
 *        in-flight/last-sent run state, for review in /admin. Read-only.
 * POST — two actions on the same route (both admin-gated):
 *        action "test"  — send ONE copy of the current draft to the signed-in
 *                         admin. Writes an email_sends audit row and NOTHING
 *                         else (no ledger, no digest_runs, no lastNotifiedAt).
 *                         Bypasses the production gate (mails only the admin).
 *        default (send) — the human approval gate that actually sends to
 *                         subscribers. Models a write-ahead outbox (digest_runs)
 *                         so the external Resend call is never assumed atomic
 *                         with our DB writes. Hard-gated to production + admin.
 *
 * Real-send lifecycle (POST, non-test):
 *   1. guards: admin, production, CAN-SPAM postal address, confirmed recipients
 *   2. resolve audience ("major" = all subscribers; "routine" = every-filing
 *      subscribers only) and filter the confirmed list accordingly
 *   3. buildDigest; empty -> nothing to send
 *   4. idempotencyKey = sha256(sorted un-notified filing URLs)
 *      - existing run "sent"            -> 409 (already sent)
 *      - existing run "sending"/"failed"-> RESUME from its frozen payload
 *      - none                           -> freeze payload (incl. audience), "sending"
 *   5. send chunks (skipping any already confirmed), persist chunk state
 *   6. all chunks ok -> ONE atomic db.batch: write notified_filings ledger +
 *      per-recipient email_sends rows + bump recipients' lastNotifiedAt + flip
 *      run to "sent". Then email the admin a receipt.
 *   7. any chunk failed -> persist "failed"; the admin retries (retry = resume).
 *
 * neon-http has no interactive transactions, so the finalize uses db.batch,
 * which runs its statements as a single atomic request.
 */
import { NextResponse } from "next/server";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { alertSignups, digestRuns, emailSends, notifiedFilings } from "@/lib/schema";
import {
  buildDigest,
  digestIdempotencyKey,
  filterRecipientsByAudience,
  recipientAudienceCounts,
  type AudienceRecipient,
  type DigestAudience,
} from "@/lib/digest";
import {
  sendDigestBatch,
  sendTransactional,
  type DigestChunkResult,
  type DigestRecipient,
} from "@/lib/email-send";
import { buildDigestEmail } from "@/lib/emails";
import { mintToken } from "@/lib/tokens";
import { notify } from "@/lib/notify";
import { POSTAL_ADDRESS, siteUrl, unsubscribePageUrl } from "@/lib/email-config";
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
  /** The audience chosen at send time; replayed on resume so a retry never
   * silently widens or narrows the recipient set. Optional for backward-compat
   * with any run frozen before this field existed. */
  audience?: DigestAudience;
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

/** Confirmed subscribers only, each carrying its alert_type preference so the
 * caller can filter by audience. Legacy never-consented rows are status 'active'
 * with a null confirmedAt — they must be excluded until re-permission stamps
 * confirmedAt via the confirm flow. */
async function loadConfirmedRecipients(): Promise<AudienceRecipient[]> {
  return db
    .select({
      id: alertSignups.id,
      email: alertSignups.email,
      alertType: alertSignups.alertType,
    })
    .from(alertSignups)
    .where(and(eq(alertSignups.status, "active"), isNotNull(alertSignups.confirmedAt)));
}

/** Parse the requested audience from the POST body; defaults to the conservative
 * "routine" (every-filing subscribers only) so a major-only subscriber is never
 * mailed by accident when the field is omitted or malformed. */
function parseAudience(value: unknown): DigestAudience {
  return value === "major" ? "major" : "routine";
}

/** Strip alertType before freezing: the frozen recipient list is the send list,
 * already audience-filtered, so it only needs id + email. */
function toSendRecipients(recipients: AudienceRecipient[]): DigestRecipient[] {
  return recipients.map(({ id, email }) => ({ id, email }));
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const draft = await buildDigest();
    const recipients = await loadConfirmedRecipients();
    const recipientCount = recipients.length;
    // Total confirmed, every-filing ("all"), and major-only counts so the UI can
    // show "Routine reaches N; major reaches M."
    const counts = recipientAudienceCounts(recipients);

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
      // Audience breakdown: a "major" send reaches counts.total, a "routine"
      // send reaches counts.all (the every-filing subscribers).
      recipientCounts: counts,
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

/**
 * "Send test to me": mail exactly ONE copy of the current draft to the admin.
 *
 * Deliberately isolated from the real-send path: it NEVER touches
 * notified_filings, digest_runs, or lastNotifiedAt — a test consumes nothing.
 * The only DB write is the email_sends audit row that sendTransactional logs
 * (kind "digest_test"). It bypasses the production gate (mailing only the admin
 * is safe anywhere a Resend key exists) but keeps the postal-address guard so
 * the CAN-SPAM footer renders real.
 *
 * Idempotency key is per-invocation (includes Date.now()) so a test never
 * collides with the real send's key and repeated tests always deliver.
 */
async function handleTestSend(adminEmail: string): Promise<NextResponse> {
  // CAN-SPAM: the footer must carry a real address even for a self-test.
  if (POSTAL_ADDRESS === "[MAILING ADDRESS PENDING]") {
    return NextResponse.json(
      { error: "MAIL_POSTAL_ADDRESS is not set — required in the email footer (CAN-SPAM). Set it before sending." },
      { status: 409 }
    );
  }

  const digest = await buildDigest();
  if (digest.empty) {
    return NextResponse.json({
      status: "test-empty",
      empty: true,
      message: "Nothing to send — no un-notified filings in the current draft.",
    });
  }

  // Use the admin's own real unsubscribe link if they're a signup; otherwise
  // fall back to the site URL rather than minting a token for a nonexistent row.
  const [ownRow] = await db
    .select({ id: alertSignups.id })
    .from(alertSignups)
    .where(eq(alertSignups.email, adminEmail))
    .limit(1);
  const unsubscribeLink = ownRow
    ? unsubscribePageUrl(mintToken(ownRow.id, "unsubscribe"))
    : siteUrl();

  const email = buildDigestEmail(digest.items, unsubscribeLink);
  const result = await sendTransactional({
    to: adminEmail,
    subject: `[TEST] ${email.subject}`,
    html: email.html,
    text: email.text,
    kind: "digest_test",
    headers: { "List-Unsubscribe": `<${unsubscribeLink}>` },
    // Per-invocation idempotency key so repeated tests all deliver (Resend
    // dedupes identical keys within 24h; the real send uses filing-set keys).
    idempotencyKey: `digest-test-${Date.now()}`,
  });

  if (!result.ok) {
    return NextResponse.json(
      { status: "test-failed", error: result.error ?? "Test send failed." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    status: "test-sent",
    to: adminEmail,
    officialCount: digest.items.length,
    filingCount: digest.filingUrls.length,
  });
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const approvedBy = session.user.email;

  // Parse the body once (tolerate an empty/absent body: a bare send POST).
  let body: { action?: string; audience?: string } = {};
  try {
    body = (await req.json()) as { action?: string; audience?: string };
  } catch {
    body = {};
  }

  // Test action: mail only the admin, no ledger/run/lastNotifiedAt writes.
  // Handled BEFORE the production gate — a self-test is safe anywhere.
  if (body.action === "test") {
    try {
      return await handleTestSend(approvedBy);
    } catch (err) {
      console.error("[admin/digest] test send failed:", err);
      return NextResponse.json({ error: "Test send failed." }, { status: 500 });
    }
  }

  const audience = parseAudience(body.audience);

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

    // Filter the confirmed list to the chosen audience BEFORE freezing it, so
    // the frozen recipient list IS the send list (resume replays it verbatim).
    const confirmed = await loadConfirmedRecipients();
    const recipients = toSendRecipients(
      filterRecipientsByAudience(confirmed, audience)
    );
    if (recipients.length === 0) {
      return NextResponse.json({
        status: "no-recipients",
        recipientCount: 0,
        message:
          audience === "routine"
            ? "No every-filing subscribers to send a routine update to — nothing sent."
            : "No confirmed recipients yet — nothing sent.",
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
      // audience is recorded so resume replays the same list and the audit
      // trail shows which cohort was targeted.
      payload = {
        items: digest.items,
        filings: digest.filings,
        recipients,
        key,
        audience,
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

    // The audience actually sent to — the frozen value on resume, or the
    // just-parsed one on a fresh run (frozen preferred if both present).
    const sentAudience: DigestAudience = payload.audience ?? audience;

    // Admin receipt (best-effort; a notify failure never fails the send).
    await notify({
      type: "digest_sent",
      headline: `Digest sent — ${sentRows.length} recipient${sentRows.length === 1 ? "" : "s"}, ${payload.filings.length} filing${payload.filings.length === 1 ? "" : "s"}`,
      summary: `Digest run #${runId} (${sentAudience} audience) delivered to ${sentRows.length} confirmed subscriber${sentRows.length === 1 ? "" : "s"} covering ${payload.items.length} official${payload.items.length === 1 ? "" : "s"}.`,
      metadata: {
        runId,
        audience: sentAudience,
        recipients: sentRows.length,
        officials: payload.items.length,
        filings: payload.filings.length,
      },
    });

    return NextResponse.json({
      status: "sent",
      runId,
      audience: sentAudience,
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
