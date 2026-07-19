import { NextResponse, after } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { alertSignups } from "@/lib/schema";
import { notify } from "@/lib/notify";
import { mintToken, type TokenPurpose } from "@/lib/tokens";
import { confirmPageUrl } from "@/lib/email-config";
import { buildConfirmationEmail } from "@/lib/emails";
import { sendTransactional } from "@/lib/email-send";

type AlertType = "major" | "all";

const ALERT_TYPES = new Set<AlertType>(["major", "all"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 8;
const recentRequests = new Map<string, number[]>();

// Durable per-email throttle window. The real anti-list-bombing guard is the
// alertSignups.confirmationSentAt column (survives restarts / works across
// serverless instances) — the per-IP map above is just a cheap first line.
const CONFIRM_THROTTLE_MS = 15 * 60 * 1000;

// Cap the per-IP map so a churn of unique IPs can't grow it unbounded.
const IP_MAP_MAX_KEYS = 1000;

function getIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

function tooMany(map: Map<string, number[]>, key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const recent = (map.get(key) ?? []).filter((ts) => now - ts < windowMs);
  recent.push(now);
  map.set(key, recent);
  // Evict keys whose window has fully elapsed once the map gets large, so a
  // stream of unique IPs can't leak memory.
  if (map.size > IP_MAP_MAX_KEYS) {
    for (const [k, times] of map) {
      if (times.every((ts) => now - ts >= windowMs)) map.delete(k);
    }
  }
  return recent.length > max;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

// mintToken throws if ALERT_TOKEN_SECRET is unset; wrap so a config error becomes
// a graceful send failure instead of an unhandled 500.
function mintTokenSafe(id: number, purpose: TokenPurpose): string | null {
  try {
    return mintToken(id, purpose);
  } catch (err) {
    console.error("[alerts] mintToken failed:", err);
    return null;
  }
}

export async function POST(req: Request) {
  const ip = getIp(req);
  if (tooMany(recentRequests, ip, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX)) {
    return NextResponse.json(
      { ok: false, error: "Too many submissions. Try again later." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  // Honeypot: a hidden form field real users never fill. If it has a value, a
  // bot submitted the form — silently pretend success so the bot learns nothing.
  if (cleanText(data.company, 200)) {
    return NextResponse.json({ ok: true });
  }

  const email = cleanText(data.email, 254)?.toLowerCase() ?? "";
  // alertType is retired from send routing (follows model routes by officialSlug
  // now). Kept for backward compat: accept a valid value, else default to
  // "major" — never reject a signup over it.
  const rawAlertType = cleanText(data.alertType, 20) as AlertType | null;
  const alertType: AlertType =
    rawAlertType && ALERT_TYPES.has(rawAlertType) ? rawAlertType : "major";
  const sourcePage = cleanText(data.sourcePage, 200);
  const officialSlug = cleanText(data.officialSlug, 100);
  const referrer = cleanText(data.referrer, 500) ?? cleanText(req.headers.get("referer"), 500);
  const userAgent = cleanText(req.headers.get("user-agent"), 500);

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  try {
    // Upsert: new rows start "pending" (must double-opt-in). On conflict we
    // refresh preferences but DO NOT touch status here — that's decided below
    // based on the existing state.
    const [row] = await db
      .insert(alertSignups)
      .values({
        email,
        alertType,
        sourcePage,
        officialSlug,
        referrer,
        userAgent,
        status: "pending",
      })
      .onConflictDoUpdate({
        target: alertSignups.email,
        set: {
          alertType,
          sourcePage,
          // Never NARROW a confirmed subscriber's follow. A follow-all reader
          // who taps "Get alerts" on one official's page (where the toggle
          // defaults to only-that-official) must not be silently downgraded to
          // a single official. Widening (slug -> all) and any change while
          // still unconfirmed are fine.
          officialSlug: sql`CASE
            WHEN ${alertSignups.status} = 'active' AND ${officialSlug ?? null}::text IS NOT NULL
              THEN ${alertSignups.officialSlug}
            ELSE ${officialSlug ?? null}::text
          END`,
          referrer,
          userAgent,
          updatedAt: sql`now()`,
        },
      })
      .returning({
        id: alertSignups.id,
        status: alertSignups.status,
        suppressedReason: alertSignups.suppressedReason,
        confirmationSentAt: alertSignups.confirmationSentAt,
        officialSlug: alertSignups.officialSlug,
      });

    const priorStatus = row.status;

    // A hard bounce means the address is dead — never email it again, and don't
    // resurrect it. (A spam complaint is different: we let them re-consent.)
    const deadBounce =
      priorStatus === "suppressed" && row.suppressedReason === "bounce";

    // Durable anti-list-bombing throttle: only (re)send a confirmation if we
    // haven't sent one to this address in the last 15 minutes.
    const recentlySent =
      row.confirmationSentAt != null &&
      Date.now() - row.confirmationSentAt.getTime() < CONFIRM_THROTTLE_MS;

    // Human-readable transition string for the admin notify. Reported AFTER any
    // status flip below, so it reflects what actually happened (not a stale
    // pre-update status).
    let outcome: string;
    let sendFailed = false;

    if (deadBounce) {
      outcome = "suppressed (bounce) — dead address, no email sent";
    } else if (priorStatus === "active") {
      // Already-confirmed addresses don't need another confirmation email.
      outcome = "active — already confirmed, no email sent";
    } else {
      // Re-opt-in: an unsubscribed / complaint-suppressed address that signs up
      // again goes back to pending, clears the suppression flag, and re-confirms.
      if (priorStatus !== "pending") {
        await db
          .update(alertSignups)
          .set({
            status: "pending",
            confirmedAt: null,
            suppressedReason: null,
            updatedAt: sql`now()`,
          })
          .where(eq(alertSignups.id, row.id));
      }

      if (recentlySent) {
        outcome = `${priorStatus} -> pending (confirmation throttled — one sent in the last 15 min)`;
      } else {
        const confirmToken = mintTokenSafe(row.id, "confirm");
        if (!confirmToken) {
          sendFailed = true;
          outcome = `${priorStatus} -> pending (confirmation NOT sent — token config error)`;
        } else {
          const mail = buildConfirmationEmail(confirmPageUrl(confirmToken));
          const result = await sendTransactional({
            to: email,
            kind: "confirmation",
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
          });
          if (result.ok) {
            // Stamp the send so the throttle above can gate the next attempt.
            await db
              .update(alertSignups)
              .set({ confirmationSentAt: new Date(), updatedAt: sql`now()` })
              .where(eq(alertSignups.id, row.id));
            outcome =
              priorStatus === "pending"
                ? "pending (confirmation sent)"
                : `${priorStatus} -> pending (re-opt-in, confirmation sent)`;
          } else {
            sendFailed = true;
            outcome = `${priorStatus} -> pending (confirmation send FAILED: ${result.error ?? "unknown"})`;
          }
        }
      }
    }

    // Admin notify is best-effort — defer past the response so it never adds
    // latency to the user's request. Runs even when we return an error below.
    after(() =>
      notify({
        type: "alert_signup",
        headline: sendFailed
          ? "Filing-alert signup — confirmation send FAILED"
          : "New filing-alert signup (pending confirmation)",
        summary: `${email} is following ${officialSlug ? officialSlug : "all officials"}. ${outcome}.`,
        metadata: {
          email,
          alertType,
          follows: officialSlug ?? "all",
          sourcePage: sourcePage ?? "unknown",
          officialSlug: officialSlug ?? "none",
          ip,
        },
      })
    );

    // A send failure is not enumeration-sensitive (the lookup paths above stay
    // generic), so tell the user plainly that the email didn't go out.
    if (sendFailed) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Could not send the confirmation email. Please try again in a few minutes.",
        },
        { status: 502 }
      );
    }

    // Already-confirmed subscribers get no email, so the form must not tell
    // them to check their inbox. followsAll lets it describe their (possibly
    // just-widened) scope honestly. Dead-bounce rows intentionally still get
    // the generic response — suppression state is not enumerable.
    if (priorStatus === "active" && !deadBounce) {
      return NextResponse.json({
        ok: true,
        alreadyActive: true,
        followsAll: row.officialSlug == null,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[alerts] Failed to save signup:", err);
    return NextResponse.json(
      { ok: false, error: "Could not save signup." },
      { status: 500 }
    );
  }
}
