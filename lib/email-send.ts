/**
 * Email sending via Resend.
 *
 * Two paths:
 *  - sendTransactional: a single email (confirmation, welcome, re-permission)
 *    via resend.emails.send. Writes its own emailSends audit row on success so
 *    callers never have to remember to log.
 *  - sendDigestBatch: chunked resend.batch.send with per-recipient unsubscribe
 *    headers + deterministic per-chunk idempotency keys. Pure send — the digest
 *    POST persists the per-recipient emailSends rows and the notified-filings
 *    ledger once a send is confirmed.
 *
 * All subscriber mail sends from DIGEST_FROM with REPLY_TO set so replies reach
 * a real inbox. If RESEND_API_KEY is missing, getResend() logs once and returns
 * null, and every send path no-ops (so local dev and previews don't crash).
 */
import { Resend } from "resend";
import {
  DIGEST_FROM,
  REPLY_TO,
  unsubscribePageUrl,
  unsubscribeUrl,
} from "@/lib/email-config";
import { mintToken } from "@/lib/tokens";
import { buildDigestEmail } from "@/lib/emails";
import { chunkKey, type DigestItem } from "@/lib/digest";

/** Audit-log kinds; mirrors emailSends.kind (excludes "admin", which notify.ts owns). */
export type EmailKind = "confirmation" | "welcome" | "digest" | "repermission";

let warnedMissingKey = false;

/**
 * Single source of truth for the Resend client. Returns null (warning logged
 * once per process) when RESEND_API_KEY is unset, so callers can no-op instead
 * of throwing. Previously three copies of this drifted — sendDigestBatch even
 * no-oped silently, contradicting its own header comment.
 */
export function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (!warnedMissingKey) {
      console.warn("[email] RESEND_API_KEY not set — email sending is disabled (no-op).");
      warnedMissingKey = true;
    }
    return null;
  }
  return new Resend(apiKey);
}

/**
 * Best-effort audit row for a single send. A failed insert must NEVER fail the
 * send itself (the email already went out), so we log and swallow. db + schema
 * are imported dynamically so importing this module in a script doesn't force
 * lib/db to evaluate before the script's dotenv.config() has run.
 */
async function logEmailSend(
  email: string,
  kind: EmailKind,
  resendMessageId?: string
): Promise<void> {
  try {
    const { db } = await import("@/lib/db");
    const { emailSends } = await import("@/lib/schema");
    await db.insert(emailSends).values({
      email,
      kind,
      resendMessageId: resendMessageId ?? null,
      status: "sent",
    });
  } catch (err) {
    console.error("[email-send] audit log insert failed:", (err as Error).message);
  }
}

export interface TransactionalEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Extra headers, e.g. List-Unsubscribe for the welcome/digest mail. */
  headers?: Record<string, string>;
  /**
   * Audit-log category. Optional for call-site compatibility; defaults to
   * "confirmation". FLAG: the confirm/welcome/repermission call sites (owned by
   * other files) should be reconciled by the orchestrator to pass an explicit
   * kind so the audit log is accurate.
   */
  kind?: EmailKind;
}

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendTransactional(
  email: TransactionalEmail
): Promise<SendResult> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: "RESEND_API_KEY not set" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: DIGEST_FROM,
      to: [email.to],
      replyTo: REPLY_TO,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.headers,
    });
    if (error) {
      console.error("[email-send] Resend error:", error);
      return { ok: false, error: error.message };
    }
    // Audit AFTER a confirmed accept; failure here never fails the send.
    await logEmailSend(email.to, email.kind ?? "confirmation", data?.id);
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error("[email-send] Failed:", (err as Error).message);
    return { ok: false, error: (err as Error).message };
  }
}

export interface DigestRecipient {
  id: number;
  email: string;
}

export interface DigestChunkResult {
  /** 0-based chunk index. */
  n: number;
  idempotencyKey: string;
  ok: boolean;
  error?: string;
  /** Per-recipient {email, messageId} for the rows we successfully sent. */
  sent: { email: string; messageId: string }[];
}

export interface DigestBatchResult {
  ok: boolean;
  chunks: DigestChunkResult[];
  /** Flattened successful sends across all chunks ATTEMPTED this run. */
  sent: { email: string; messageId: string }[];
  error?: string;
}

const BATCH_MAX = 100; // Resend batch ceiling
/** Placeholder swapped for each recipient's unsubscribe link (see below). */
const UNSUB_PLACEHOLDER = "__OPEN_CABINET_UNSUB_URL__";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Send the digest to all recipients via chunked resend.batch.send.
 *
 * Crash-safety: each chunk gets a DETERMINISTIC idempotency key from `sendKey`
 * (a hash of the filing set) + chunk index, so a retry re-sends with the same
 * key and Resend dedupes already-delivered chunks within its 24h window — no
 * double-send. The payload must therefore be deterministic: buildDigestEmail is
 * pure given `items`, and the only per-recipient variation (the unsubscribe
 * link) is a stable HMAC of the recipient id.
 *
 * Resume: `skipChunks` names chunk indices already confirmed sent (from the
 * digest_runs row). Their indices stay stable so idempotency keys and chunk
 * boundaries are unchanged; the digest POST merges this run's results with the
 * previously-persisted chunk state.
 *
 * Efficiency: the email body is identical across recipients except for the
 * unsubscribe link, so we render it ONCE with a placeholder and string-replace
 * per recipient instead of calling buildDigestEmail N times.
 *
 * Stops at the first failing chunk and reports which chunks/recipients
 * succeeded so the caller persists state and never writes the notified-filings
 * ledger for an incomplete send.
 */
export async function sendDigestBatch(
  recipients: DigestRecipient[],
  items: DigestItem[],
  sendKey: string,
  opts: { skipChunks?: number[] } = {}
): Promise<DigestBatchResult> {
  const resend = getResend();
  if (!resend) {
    // getResend already warned; surface the reason so the caller can report it.
    return { ok: false, chunks: [], sent: [], error: "RESEND_API_KEY not set" };
  }

  // Render once; only the unsubscribe link differs between recipients.
  const template = buildDigestEmail(items, UNSUB_PLACEHOLDER);
  const skip = new Set(opts.skipChunks ?? []);
  const groups = chunk(recipients, BATCH_MAX);
  const chunks: DigestChunkResult[] = [];
  const allSent: { email: string; messageId: string }[] = [];

  for (let n = 0; n < groups.length; n++) {
    if (skip.has(n)) continue; // already confirmed sent on a prior run
    const group = groups[n];
    const idempotencyKey = chunkKey(sendKey, n);
    const emails = group.map((r) => {
      const unsubToken = mintToken(r.id, "unsubscribe");
      // Body link is the human interstitial page (a bare GET must never
      // mutate — link scanners prefetch it); the header targets the API
      // route for RFC 8058 one-click providers, which POST.
      const pageLink = unsubscribePageUrl(unsubToken);
      return {
        from: DIGEST_FROM,
        to: [r.email],
        replyTo: REPLY_TO,
        subject: template.subject,
        html: template.html.replaceAll(UNSUB_PLACEHOLDER, pageLink),
        text: template.text.replaceAll(UNSUB_PLACEHOLDER, pageLink),
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl(unsubToken)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };
    });

    try {
      const { data, error } = await resend.batch.send(emails, { idempotencyKey });
      if (error) {
        chunks.push({ n, idempotencyKey, ok: false, error: error.message, sent: [] });
        return { ok: false, chunks, sent: allSent, error: error.message };
      }
      // Map positional response ids back to recipients by index.
      const ids = data?.data ?? [];
      const sent = group.map((r, i) => ({ email: r.email, messageId: ids[i]?.id ?? "" }));
      allSent.push(...sent);
      chunks.push({ n, idempotencyKey, ok: true, sent });
    } catch (err) {
      const message = (err as Error).message;
      chunks.push({ n, idempotencyKey, ok: false, error: message, sent: [] });
      return { ok: false, chunks, sent: allSent, error: message };
    }
  }

  return { ok: true, chunks, sent: allSent };
}
