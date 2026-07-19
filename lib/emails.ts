/**
 * Email templates as plain, deterministic HTML/text builders.
 *
 * Why hand-written instead of React Email: (1) the react-email CLI is blocked by
 * a pnpm supply-chain trust check, and (2) the digest send relies on Resend
 * idempotency, which rejects a replay whose body differs byte-for-byte — so the
 * templates MUST be deterministic (no timestamps, no randomness, stable ordering).
 * Plain string builders give us that guarantee directly.
 *
 * Styling mirrors the site: white background, near-black text (neutral-900), a
 * 3px neutral-800 top bar, a serif headline (Georgia — the closest web-safe
 * stand-in for Source Serif, since email clients strip custom fonts), DM-Sans-ish
 * system sans body. Email needs inline styles + table layout to render in Gmail.
 */
import { POSTAL_ADDRESS, siteUrl } from "@/lib/email-config";
import type { DigestItem } from "@/lib/digest";

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

const COLORS = {
  bg: "#ffffff",
  text: "#171717", // neutral-900
  muted: "#737373", // neutral-500
  bar: "#262626", // neutral-800
  border: "#e5e5e5", // neutral-200
};

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Wrap body HTML in the shared shell (top bar, container, footer). `footerExtra`
 * holds the unsubscribe line for mail that needs it (welcome/digest).
 */
function layout(opts: {
  heading: string;
  bodyHtml: string;
  footerExtra?: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${COLORS.bg};color:${COLORS.text};font-family:${SANS};">
  <div style="height:3px;background:${COLORS.bar};width:100%;"></div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td>
          <div style="font-family:${SANS};font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.muted};margin-bottom:24px;">Open Cabinet</div>
          <h1 style="font-family:${SERIF};font-size:26px;line-height:1.25;font-weight:normal;color:${COLORS.text};margin:0 0 20px;">${escapeHtml(opts.heading)}</h1>
          ${opts.bodyHtml}
        </td></tr>
        <tr><td style="padding-top:32px;margin-top:32px;border-top:1px solid ${COLORS.border};">
          <p style="font-family:${SANS};font-size:12px;line-height:1.6;color:${COLORS.muted};margin:24px 0 0;">
            Open Cabinet tracks executive-branch financial disclosures filed with the U.S. Office of Government Ethics.<br>
            ${escapeHtml(POSTAL_ADDRESS)}
            ${opts.footerExtra ? `<br>${opts.footerExtra}` : ""}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="background:${COLORS.bar};">
    <a href="${href}" style="display:inline-block;padding:12px 22px;font-family:${SANS};font-size:15px;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

/** Double-opt-in confirmation. No unsubscribe footer (they aren't subscribed yet). */
export function buildConfirmationEmail(confirmLink: string): BuiltEmail {
  const subject = "Confirm your Open Cabinet filing alerts";
  const html = layout({
    heading: "Confirm your filing alerts",
    bodyHtml: `
      <p style="font-family:${SANS};font-size:15px;line-height:1.6;color:${COLORS.text};margin:0 0 20px;">
        You asked to get an email when executive-branch officials report new stock trades. Confirm your address to start receiving alerts.
      </p>
      ${button(confirmLink, "Confirm my email")}
      <p style="font-family:${SANS};font-size:13px;line-height:1.6;color:${COLORS.muted};margin:0;">
        Alerts go out only when there's a new filing — most weeks that's nothing. If you didn't request this, ignore this email and you'll receive nothing.
      </p>
      <p style="font-family:${SANS};font-size:12px;line-height:1.6;color:${COLORS.muted};margin:20px 0 0;word-break:break-all;">
        Button not working? Paste this link:<br>${escapeHtml(confirmLink)}
      </p>`,
  });
  const text = `Confirm your Open Cabinet filing alerts

You asked to get an email when executive-branch officials report new stock trades. Confirm your address to start receiving alerts:

${confirmLink}

Alerts go out only when there's a new filing. If you didn't request this, ignore this email.

— Open Cabinet
${POSTAL_ADDRESS}`;
  return { subject, html, text };
}

/**
 * One-time re-permission email for legacy single-opt-in signups. Asks them to
 * confirm (so we have clean consent before any real send). Includes unsubscribe.
 */
export function buildRepermissionEmail(
  confirmLink: string,
  unsubscribeLink: string
): BuiltEmail {
  const subject = "Sorry this took a minute — confirm your Open Cabinet alerts";
  const unsubHtml = `Don't want these? <a href="${unsubscribeLink}" style="color:${COLORS.muted};">Unsubscribe</a>.`;
  const html = layout({
    heading: "Thanks for signing up — one quick step",
    bodyHtml: `
      <p style="font-family:${SANS};font-size:15px;line-height:1.6;color:${COLORS.text};margin:0 0 20px;">
        You signed up for Open Cabinet email alerts about executive-branch stock trades, and it took a minute to get the first one ready. Sorry about that, and thanks for your patience.
      </p>
      <p style="font-family:${SANS};font-size:15px;line-height:1.6;color:${COLORS.text};margin:0 0 20px;">
        Alerts are ready to go now. Confirm your address and you'll start getting an email when officials report new trades.
      </p>
      ${button(confirmLink, "Yes, keep me subscribed")}
      <p style="font-family:${SANS};font-size:13px;line-height:1.6;color:${COLORS.muted};margin:0;">
        If you don't confirm, you simply won't get any more emails — no action needed.
      </p>
      <p style="font-family:${SANS};font-size:12px;line-height:1.6;color:${COLORS.muted};margin:20px 0 0;word-break:break-all;">
        Button not working? Paste this link:<br>${escapeHtml(confirmLink)}
      </p>`,
    footerExtra: unsubHtml,
  });
  const text = `Thanks for signing up for Open Cabinet filing alerts — one quick step

You signed up for email alerts about executive-branch stock trades, and it took a minute to get the first one ready. Sorry about that, and thanks for your patience.

Alerts are ready to go now. Confirm your address to start getting an email when officials report new trades:

${confirmLink}

If you don't confirm, you won't get any more emails. No action needed.

Unsubscribe: ${unsubscribeLink}

— Open Cabinet
${POSTAL_ADDRESS}`;
  return { subject, html, text };
}

/**
 * OGE asset descriptions usually already carry the ticker, e.g.
 * "Corning, Inc. (GLW)" — only append ours when the description doesn't,
 * otherwise every line reads "(GLW) (GLW)".
 */
function showTicker(t: { description: string; ticker: string | null }): boolean {
  return Boolean(t.ticker) && !t.description.includes(`(${t.ticker})`);
}

/**
 * The filing-alert digest. One section per official with a small trades table.
 * Deterministic output (no timestamps) so a crash-safe re-send is byte-identical
 * for Resend idempotency. Sale = red, Purchase = emerald (mirrors the site).
 */
export function buildDigestEmail(
  items: DigestItem[],
  unsubscribeLink: string
): BuiltEmail {
  const base = siteUrl();
  const subject =
    items.length === 1
      ? `New filing: ${items[0].name}`
      : `${items.length} new executive-branch filings`;

  const sections = items
    .map((item) => {
      const rows = item.trades
        .map((t) => {
          const color =
            t.type.startsWith("Sale") ? "#dc2626" : t.type === "Purchase" ? "#059669" : COLORS.text;
          const late = t.lateFilingFlag
            ? ` <span style="background:#fcd34d;color:#451a03;font-size:10px;padding:1px 4px;">LATE</span>`
            : "";
          return `<tr>
            <td style="padding:6px 8px;border-bottom:1px solid ${COLORS.border};font-family:${SANS};font-size:13px;color:${COLORS.text};">${escapeHtml(t.description)}${showTicker(t) ? ` (${escapeHtml(t.ticker as string)})` : ""}${late}</td>
            <td style="padding:6px 8px;border-bottom:1px solid ${COLORS.border};font-family:${SANS};font-size:13px;color:${color};white-space:nowrap;">${escapeHtml(t.type)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid ${COLORS.border};font-family:'SF Mono',Consolas,monospace;font-size:12px;color:${COLORS.text};white-space:nowrap;">${escapeHtml(t.amount)}</td>
          </tr>`;
        })
        .join("");

      return `<div style="margin:0 0 28px;">
        <div style="font-family:${SERIF};font-size:18px;color:${COLORS.text};margin:0 0 2px;">${escapeHtml(item.name)}</div>
        <div style="font-family:${SANS};font-size:12px;color:${COLORS.muted};margin:0 0 10px;">${escapeHtml(item.title)} · ${escapeHtml(item.agency)} · ${item.newCount} new trade${item.newCount === 1 ? "" : "s"}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${COLORS.border};margin-bottom:8px;">${rows}</table>
        <a href="${base}/officials/${encodeURIComponent(item.slug)}" style="font-family:${SANS};font-size:13px;color:${COLORS.text};">View on Open Cabinet</a>
        &nbsp;·&nbsp;
        <a href="${escapeHtml(item.primaryFilingUrl)}" style="font-family:${SANS};font-size:13px;color:${COLORS.muted};">OGE filing (PDF)</a>
      </div>`;
    })
    .join("");

  const unsubHtml = `You're getting this because you subscribed. <a href="${unsubscribeLink}" style="color:${COLORS.muted};">Unsubscribe</a>.`;
  const html = layout({
    heading: items.length === 1 ? "A new filing" : "New filings",
    bodyHtml: `
      <p style="font-family:${SANS};font-size:14px;line-height:1.6;color:${COLORS.muted};margin:0 0 24px;">
        New executive-branch financial disclosures, sourced from the U.S. Office of Government Ethics. Amounts are ranges, as filed.
      </p>
      ${sections}`,
    footerExtra: unsubHtml,
  });

  const textSections = items
    .map((item) => {
      const lines = item.trades
        .map((t) => `  - ${t.description}${showTicker(t) ? ` (${t.ticker})` : ""}: ${t.type}, ${t.amount}${t.lateFilingFlag ? " [LATE]" : ""}`)
        .join("\n");
      return `${item.name} — ${item.title}, ${item.agency} (${item.newCount} new)
${lines}
  ${base}/officials/${item.slug}
  Filing: ${item.primaryFilingUrl}`;
    })
    .join("\n\n");

  const text = `${subject}

New executive-branch financial disclosures from the U.S. Office of Government Ethics.

${textSections}

Unsubscribe: ${unsubscribeLink}

— Open Cabinet
${POSTAL_ADDRESS}`;

  return { subject, html, text };
}

/** Sent after a successful confirm. Includes the unsubscribe line. */
export function buildWelcomeEmail(unsubscribeLink: string): BuiltEmail {
  const subject = "You're on the Open Cabinet filing-alert list";
  const unsubHtml = `You can <a href="${unsubscribeLink}" style="color:${COLORS.muted};">unsubscribe</a> anytime.`;
  const html = layout({
    heading: "You're confirmed",
    bodyHtml: `
      <p style="font-family:${SANS};font-size:15px;line-height:1.6;color:${COLORS.text};margin:0 0 20px;">
        You'll get an email whenever a tracked official reports a new stock trade. No filings, no email — so expect a quiet inbox most of the time.
      </p>
      <p style="font-family:${SANS};font-size:15px;line-height:1.6;color:${COLORS.text};margin:0 0 20px;">
        Browse the data anytime at <a href="https://open-cabinet.org" style="color:${COLORS.text};">open-cabinet.org</a>.
      </p>
      <p style="font-family:${SANS};font-size:13px;line-height:1.6;color:${COLORS.muted};margin:0;">— Trevor Brown, Open Cabinet</p>`,
    footerExtra: unsubHtml,
  });
  const text = `You're confirmed

You'll get an email whenever a tracked official reports a new stock trade. No filings, no email.

Browse the data anytime: https://open-cabinet.org

Unsubscribe anytime: ${unsubscribeLink}

— Trevor Brown, Open Cabinet
${POSTAL_ADDRESS}`;
  return { subject, html, text };
}
