/**
 * Admin API: filing-alert digest.
 *
 * GET  — assemble the draft digest (what WOULD be sent), the follows breakdown
 *        (how many confirmed subscribers this digest reaches vs. excludes), and
 *        any in-flight/last-sent run state, for review in /admin. Read-only.
 * POST — two actions on the same route (both admin-gated):
 *        action "test"  — send ONE copy of the current draft (or a single-
 *                         official preview) to the signed-in admin. Writes an
 *                         email_sends audit row and NOTHING else (no ledger, no
 *                         digest_runs, no lastNotifiedAt). Bypasses the
 *                         production gate (mails only the admin).
 *        default (send) — the human approval gate that actually sends to
 *                         subscribers. Models a write-ahead outbox (digest_runs)
 *                         so the external Resend call is never assumed atomic
 *                         with our DB writes. Hard-gated to production + admin.
 *
 * FOLLOWS MODEL: a signup follows either ALL officials (officialSlug null —
 * home-page signups) or ONE official (officialSlug set — signed up on that
 * official's page). A real digest reaches a confirmed recipient iff they follow
 * all officials OR follow one of the officials present in the digest. The old
 * major/all alertType preference is no longer read for send routing.
 *
 * Real-send lifecycle (POST, non-test):
 *   1. guards: admin, production, CAN-SPAM postal address, confirmed recipients
 *   2. buildDigest; empty -> nothing to send
 *   3. filter confirmed recipients by follows against the draft's official slugs
 *   4. idempotencyKey = sha256(sorted un-notified filing URLs)
 *      - existing run "sent"            -> 409 (already sent)
 *      - existing run "sending"/"failed"-> RESUME from its frozen payload
 *      - none                           -> freeze payload (recipients + slugs),
 *                                          "sending"
 *   5. send chunks (skipping any already confirmed), persist chunk state
 *   6. all chunks ok -> ONE atomic db.batch: write notified_filings ledger +
 *      per-recipient email_sends rows + bump recipients' lastNotifiedAt + flip
 *      run to "sent". Then email the admin a receipt.
 *   7. any chunk failed -> persist "failed"; the admin retries (retry = resume).
 *
 * One identical email body goes to every recipient — recipients are selected by
 * follows, never by content-filtering the digest. (The test action can content-
 * filter to preview a single-official digest; real sends never do.)
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
  filterRecipientsByFollows,
  followsBreakdown,
  type FollowsRecipient,
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
import type { AlsoNewOfficial, DigestItem } from "@/lib/digest";

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
  /** The official slugs this digest covers, frozen at send time so resume
   * replays the same follows-filtered recipient set (the frozen `recipients`
   * IS the send list; slugs are kept for the receipt breakdown). Optional for
   * backward-compat with any run frozen before this field existed. */
  slugs?: string[];
  /** "Also filed recently" teaser + follow-all CTA count, frozen so a resumed
   * send renders the byte-identical body (Resend idempotency requires it).
   * Optional for runs frozen before these fields existed (block simply absent). */
  alsoNew?: AlsoNewOfficial[];
  trackedOfficialCount?: number;
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

/** Confirmed subscribers only, each carrying the single official they follow
 * (officialSlug: null = follows all). Legacy never-consented rows are status
 * 'active' with a null confirmedAt — they must be excluded until re-permission
 * stamps confirmedAt via the confirm flow. */
async function loadConfirmedRecipients(): Promise<FollowsRecipient[]> {
  return db
    .select({
      id: alertSignups.id,
      email: alertSignups.email,
      officialSlug: alertSignups.officialSlug,
    })
    .from(alertSignups)
    .where(and(eq(alertSignups.status, "active"), isNotNull(alertSignups.confirmedAt)));
}

/** Strip officialSlug before freezing: the frozen recipient list is the send
 * list, already follows-filtered, so it only needs id + email. */
function toSendRecipients(recipients: FollowsRecipient[]): DigestRecipient[] {
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
    // Follows breakdown computed against THIS draft's official slugs: how many
    // confirmed subscribers the digest reaches (all-followers plus followers of
    // officials in the draft) vs. how many it excludes.
    const follows = followsBreakdown(recipients, draft.slugs);

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
      // Follows breakdown for the draft: { total, allFollowers, reached,
      // excluded, byOfficial } — how many this specific digest reaches.
      follows,
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
 * `onlyOfficial` (optional) content-filters the digest to a single official's
 * items so the admin can PREVIEW what a narrower, single-official digest would
 * look like. It must be a slug present in the current draft (else 400). NOTE:
 * real sends NEVER content-filter — every recipient gets the identical full
 * body, and audience is decided purely by follows. This filtering exists only
 * for the admin preview.
 *
 * Idempotency key is per-invocation (includes Date.now()) so a test never
 * collides with the real send's key and repeated tests always deliver.
 */
async function handleTestSend(
  adminEmail: string,
  onlyOfficial?: string
): Promise<NextResponse> {
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

  // Optional single-official preview: narrow the CONTENT to one official's card.
  // Reject a slug that isn't in the draft so the admin can't preview a phantom.
  let items = digest.items;
  if (onlyOfficial) {
    items = digest.items.filter((i) => i.slug === onlyOfficial);
    if (items.length === 0) {
      return NextResponse.json(
        {
          error: `"${onlyOfficial}" is not an official in the current draft. Pick one from the draft or send the full digest.`,
        },
        { status: 400 }
      );
    }
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

  // The test mirrors what recipients get, including the "Also filed recently"
  // teaser and follow-all CTA (also shown on the single-official preview, since
  // a real narrower digest would carry them too).
  const email = buildDigestEmail(items, unsubscribeLink, {
    alsoNew: digest.alsoNew,
    trackedOfficialCount: digest.trackedOfficialCount,
  });
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
    // Reflect what was actually mailed: the single-official preview count when
    // onlyOfficial was passed, otherwise the full draft.
    officialCount: items.length,
    onlyOfficial: onlyOfficial ?? null,
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
  // `audience` is accepted-and-ignored for stale clients; the follows model no
  // longer routes by audience. `onlyOfficial` is a test-only preview filter.
  let body: { action?: string; onlyOfficial?: string; audience?: string } = {};
  try {
    body = (await req.json()) as {
      action?: string;
      onlyOfficial?: string;
      audience?: string;
    };
  } catch {
    body = {};
  }

  // Test action: mail only the admin, no ledger/run/lastNotifiedAt writes.
  // Handled BEFORE the production gate — a self-test is safe anywhere.
  if (body.action === "test") {
    try {
      const onlyOfficial =
        typeof body.onlyOfficial === "string" && body.onlyOfficial.trim()
          ? body.onlyOfficial.trim()
          : undefined;
      return await handleTestSend(approvedBy, onlyOfficial);
    } catch (err) {
      console.error("[admin/digest] test send failed:", err);
      return NextResponse.json({ error: "Test send failed." }, { status: 500 });
    }
  }

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

    // Select recipients by FOLLOWS against the draft's official slugs (follow-all
    // subscribers plus followers of an official in this digest). Filter BEFORE
    // freezing so the frozen recipient list IS the send list (resume replays it
    // verbatim). Every recipient gets the identical body — no content-filtering.
    //
    // `follows` is a display breakdown for the receipt/response. On resume it is
    // recomputed against the current digest.slugs, which is safe: the run is keyed
    // on the filing-URL set, so the same key implies the same officials/slugs.
    const confirmed = await loadConfirmedRecipients();
    const follows = followsBreakdown(confirmed, digest.slugs);
    const recipients = toSendRecipients(
      filterRecipientsByFollows(confirmed, digest.slugs)
    );

    const key = digestIdempotencyKey(digest.filingUrls);

    // Look up any existing run for THIS filing set. This must happen BEFORE any
    // empty-recipient early return: a resume sends to the run's FROZEN recipient
    // list, so the freshly recomputed filter must not be allowed to strand a
    // partial send (which would leave the ledger unwritten and re-trigger these
    // filings in the next digest — a double send for everyone already mailed).
    const [existing] = await db
      .select()
      .from(digestRuns)
      .where(eq(digestRuns.idempotencyKey, key))
      .limit(1);

    if (!existing && recipients.length === 0) {
      return NextResponse.json({
        status: "no-recipients",
        recipientCount: 0,
        message:
          "No confirmed subscribers follow the officials in this digest — nothing sent.",
      });
    }

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
      // The follows-filtered recipients ARE the send list; slugs are recorded so
      // the receipt breakdown is stable on resume. alsoNew + trackedOfficialCount
      // are frozen too so a resumed send renders the byte-identical body.
      payload = {
        items: digest.items,
        filings: digest.filings,
        recipients,
        key,
        slugs: digest.slugs,
        alsoNew: digest.alsoNew,
        trackedOfficialCount: digest.trackedOfficialCount,
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

    // Send only the chunks not already confirmed on a prior run. The teaser
    // fields come from the FROZEN payload (never rebuilt) so resume bodies
    // match the original byte-for-byte.
    const doneChunks = priorChunks.filter((c) => c.ok).map((c) => c.n);
    const batch = await sendDigestBatch(payload.recipients, payload.items, key, {
      skipChunks: doneChunks,
      alsoNew: payload.alsoNew,
      trackedOfficialCount: payload.trackedOfficialCount,
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
      summary: `Digest run #${runId} delivered to ${sentRows.length} confirmed subscriber${sentRows.length === 1 ? "" : "s"} following ${payload.items.length} official${payload.items.length === 1 ? "" : "s"} (${follows.allFollowers} follow all, ${follows.excluded} other-official followers excluded).`,
      metadata: {
        runId,
        recipients: sentRows.length,
        officials: payload.items.length,
        filings: payload.filings.length,
        allFollowers: follows.allFollowers,
        excluded: follows.excluded,
        // notify metadata is scalar-only; serialize per-official follower counts.
        byOfficial: Object.entries(follows.byOfficial)
          .map(([slug, n]) => `${slug}:${n}`)
          .join(", "),
      },
    });

    return NextResponse.json({
      status: "sent",
      runId,
      recipientCount: sentRows.length,
      filingCount: payload.filings.length,
      officialCount: payload.items.length,
      // Follows breakdown so the admin sees who was reached vs. excluded.
      follows: {
        total: follows.total,
        allFollowers: follows.allFollowers,
        reached: follows.reached,
        excluded: follows.excluded,
        byOfficial: follows.byOfficial,
      },
      warning: freeTierWarning(sentRows.length),
    });
  } catch (err) {
    console.error("[admin/digest] POST failed:", err);
    return NextResponse.json({ error: "Digest send failed." }, { status: 500 });
  }
}
