/**
 * Central email sender/recipient constants.
 *
 * All Open Cabinet mail sends from the project's own verified Resend domain,
 * open-cabinet.org (swapped from trevorthewebdeveloper.com — see
 * docs/email-alerts-YOUR-SETUP.md and memory reference_resend_email_setup).
 *
 *  - alerts@   : admin notifications (lib/notify.ts) — pipeline/signup/feedback
 *  - digest@   : subscriber-facing filing-alert digests + confirm/welcome mail
 *  - Reply-To  : the admin Gmail, so subscriber replies reach a real inbox
 *
 * The site's public base URL is used to build confirm/unsubscribe links.
 */

export const ADMIN_EMAIL = "trevorbrown.web@gmail.com";

/** Admin-facing notifications. */
export const ALERTS_FROM = "Open Cabinet <alerts@open-cabinet.org>";

/** Subscriber-facing mail (digest, confirmation, welcome, re-permission). */
export const DIGEST_FROM = "Open Cabinet <digest@open-cabinet.org>";

/** Replies to subscriber mail land in the admin inbox. */
export const REPLY_TO = ADMIN_EMAIL;

/**
 * Postal address required in the footer of bulk email (CAN-SPAM).
 *
 * Read from env (NOT hardcoded) because this repo is public — a residential
 * address must not be committed. Set MAIL_POSTAL_ADDRESS in .env.local and in
 * Vercel before the first real subscriber send. A PO box is strongly preferred
 * over a home address since this string appears in every email footer.
 */
export const POSTAL_ADDRESS =
  process.env.MAIL_POSTAL_ADDRESS || "[MAILING ADDRESS PENDING]";

/**
 * Public site origin for building absolute links in emails. Prefers an explicit
 * env override, then the Vercel-provided URL, then the production domain.
 */
export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "https://open-cabinet.org";
}

/**
 * API-route URLs (POST-only mutations). These are what the `List-Unsubscribe`
 * header points at — RFC 8058 providers POST there directly. They must NOT be
 * used as human-clickable links in email bodies: mail scanners prefetch GETs,
 * so the clickable links use the interstitial *page* URLs below instead.
 */
export function confirmUrl(token: string): string {
  return `${siteUrl()}/api/alerts/confirm?token=${encodeURIComponent(token)}`;
}

export function unsubscribeUrl(token: string): string {
  return `${siteUrl()}/api/alerts/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Interstitial-page URLs. These are the links a human clicks in an email. Each
 * renders a server page with a plain POST form, so a scanner prefetching the
 * GET never triggers the mutation (preserves double opt-in / avoids auto-unsub).
 */
export function confirmPageUrl(token: string): string {
  return `${siteUrl()}/alerts/confirm?token=${encodeURIComponent(token)}`;
}

export function unsubscribePageUrl(token: string): string {
  return `${siteUrl()}/alerts/unsubscribe?token=${encodeURIComponent(token)}`;
}
