# Email Alerts — Tomorrow's Runbook (go-live)

The whole point of this doc: a fixed order, one owner per step, a check after each.
No improvising, no "wait what's the status." Follow top to bottom. Nothing reaches a
real subscriber until Step 7, and only with your explicit click.

Status as of tonight: double opt-in built and tested (phases 0-4). Build passes, 16
tests green. Phase 5 (the Send button) + backfill + route tests are what Claude finishes
(overnight loop is already on it). You = env + review + approve. That's it.

---

## Step 1 — You: set 3 env vars (5 min)

In `.env.local` AND Vercel (Production):

| Var | How |
|---|---|
| `ALERT_TOKEN_SECRET` | run `openssl rand -hex 32`, paste the output |
| `MAIL_POSTAL_ADDRESS` | a PO box (recommended) or business address |
| `RESEND_WEBHOOK_SECRET` | from Step 2 |

**Check:** `.env.local` has all three lines; Vercel shows them under Settings → Env Vars.

## Step 2 — You: add the Resend webhook (2 min)

Resend → Webhooks → Add Webhook:
- URL: `https://open-cabinet.org/api/webhooks/resend`
- Events: `email.bounced`, `email.complained`, `email.delivered`
- Copy the **Signing Secret** → that's `RESEND_WEBHOOK_SECRET` in Step 1.

**Check:** webhook shows "enabled" in Resend.

## Step 3 — Claude (or you): apply the DB migration

`npx drizzle-kit migrate` (idempotent; adds the new columns + tables).

**Check:** no error; `alert_signups` has the new columns, `digest_runs` /
`notified_filings` / `email_sends` tables exist.

## Step 4 — Claude: finish phase 5 + verify

Gated send (outbox, chunked batch, idempotency), launch-backfill script, route tests.

**Check:** `pnpm test` all green; `pnpm build` clean. (Likely already done by the
overnight loop — Claude will report what's left.)

## Step 5 — Test the loop on YOURSELF (no real subscribers yet)

1. On the deployed/preview site, sign up with your own email.
2. Confirm via the email link → you should get the welcome email.
3. Check both render right in Gmail (and the unsubscribe link works).

**Check:** you received confirmation + welcome; clicking unsubscribe flips you to
unsubscribed; admin `/admin` shows your row's status changing.

## Step 6 — Backfill, then re-permission the legacy list

1. `pnpm tsx scripts/backfill-notified.ts` — marks all CURRENT filings as already
   sent, so the first digest doesn't blast the historical backlog. (Claude builds this.)
2. `pnpm repermission` — **dry run first**, read the count, sanity-check it.
3. `pnpm repermission --send` — emails legacy signups asking them to re-confirm.

**Check:** dry-run count matches expectations; after `--send`, watch your own copy
arrive; admin shows legacy rows flipping to `pending`.

## Step 7 — First real digest (you approve)

When the daily cron finds new filings, it emails you "digest ready — review at /admin."
1. Open `/admin` → Filing Digest section → review the draft (officials, trades, count).
2. Click **Send**. (Hard-gated to production + admin.)
3. You get a "digest sent" receipt copy.

**Check:** receipt arrives; admin shows the digest_run as `sent`; notified_filings got
the URLs; a test recipient got exactly one email.

---

## Guardrails already in place (why this won't blow up)

- Nothing sends outside `VERCEL_ENV=production`.
- Only the admin endpoint can trigger a send — never the cron.
- Send endpoint is stubbed (501) until phase 5 lands.
- Hard bounces are never re-mailed; complaints auto-suppress via webhook.
- Empty days send nothing.
- Free tier = 100 emails/day — fine under ~100 subscribers; upgrade to Pro past that.

## If something's unclear in the morning

Read this file top-down and do the next unchecked step. Don't re-litigate the strategy —
it's settled (see docs/email-alerts-DO-THIS-NOW.md and the plan). Just execute the steps.
