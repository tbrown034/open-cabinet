# Email Alerts — What You (Trevor) Need To Do

This is your checklist. I (Claude) write all the code. These are the steps only a
human with account/DNS/registrar access can do. Nothing here is urgent — none of it
sends a real email until the very last step, which you trigger by hand.

Do them in this order. Each step says exactly where to click and what to paste.

> **Domain approach (decided):** Resend's free plan allows only 1 verified domain, and
> yours is currently `trevorthewebdeveloper.com`. We are **swapping** it for
> `open-cabinet.org` — all Open Cabinet email (admin alerts + subscriber digests) sends
> from the project's own domain, at $0. This is verified safe: the only thing sending from
> `trevorthewebdeveloper.com` is Open Cabinet's own admin alerts (Claude is repointing
> those). Your personal site's contact form sends via `onboarding@resend.dev` and is
> unaffected, and all website links keep working — removing a Resend domain does not touch
> your site's hosting or DNS.

---

## Step 1 — Swap the domain in Resend

1. Log in to https://resend.com -> **Domains**.
2. Remove `trevorthewebdeveloper.com` (you can re-add it later anytime; nothing else uses
   it for sending).
3. **Add Domain** -> enter `open-cabinet.org` -> choose US East (us-east-1).
4. Resend shows a list of DNS records (usually one MX, two-to-three TXT for SPF + DKIM, and
   one TXT for DMARC). Leave this tab open — you need it for Step 2.

## Step 2 — Add those DNS records where open-cabinet.org is managed

Go to wherever open-cabinet.org's DNS lives (your registrar or Cloudflare — wherever you
manage the domain).

1. For each record Resend listed, create a matching DNS record:
   - Copy the **Type** (MX / TXT), **Name/Host**, and **Value** exactly as shown.
   - If your DNS host auto-appends the domain, enter the name without the trailing
     `.open-cabinet.org`. When unsure, paste the full host — most hosts handle both.
2. Save all records.
3. Back in Resend, click **Verify**. It can take a few minutes to a few hours to propagate.
   When every record shows a green check, the domain is verified.

**Heads up:** between removing the old domain and `open-cabinet.org` verifying, the Open
Cabinet admin "new signup" alerts pause (your personal site's contact form keeps working
the whole time). Once verified + the code is deployed, they resume from
`alerts@open-cabinet.org`. No emails are lost permanently.

You do NOT need Google Workspace or any paid mailbox. Sending is done by Resend via these
DNS records.

## Step 3 — Nothing to do (no Segment/Topic/Audience needed)

The digest sends as a transactional batch (`resend.batch.send`), so we do NOT use Resend's
Audience, Segments, or Topics at all. Leave the `/audience` page alone — the subscriber list
lives in our own database. Skip this step entirely.

## Step 4 — Set up the webhook (so bounces/complaints auto-remove)

This lets the app automatically stop emailing addresses that bounce or hit "spam."

1. In Resend -> **Webhooks** -> **Add Webhook**.
2. Endpoint URL: `https://open-cabinet.org/api/webhooks/resend`
   (this route doesn't exist yet — I'm building it; you can add the webhook now or after
   I deploy that route, either works).
3. Subscribe to these events: `email.bounced`, `email.complained`, `email.delivered`.
4. After saving, copy the webhook's **Signing Secret**. Goes into `RESEND_WEBHOOK_SECRET`
   in Step 6.

## Step 5 — Set up a free inbox to receive replies

Subscribers may reply, and bounces need somewhere to land. This is free; no Google
account needed.

Option A (recommended) — Cloudflare Email Routing (only if open-cabinet.org DNS is on
Cloudflare):
1. Cloudflare dashboard -> your domain -> **Email** -> **Email Routing** -> enable.
2. Add a route: `digest@open-cabinet.org` and `replies@open-cabinet.org` ->
   forward to your Gmail (`trevorbrown.web@gmail.com`).
3. Add the MX/TXT records it asks for (Cloudflare adds them automatically).

Option B — ImprovMX (works on any DNS host): sign up free at improvmx.com, add the
domain, set up the forward to your Gmail, add the two records it gives you.

## Step 6 — Add environment variables

These go in **two** places: Vercel (production) and your local `.env.local`. I'll add the
names to `.env.example` so they're documented; you fill in the real values.

In Vercel: Project -> **Settings** -> **Environment Variables**. Add each for the
**Production** environment (and Preview if you want):

| Variable | Value | Where it comes from |
|---|---|---|
| `RESEND_WEBHOOK_SECRET` | the signing secret | Step 4 |
| `ALERT_TOKEN_SECRET` | a random 64-char string | generate it (below) |

You already have `RESEND_API_KEY` and `DATABASE_URL` set — leave those as is.

Generate `ALERT_TOKEN_SECRET` by running this in your terminal and pasting the output:
```
openssl rand -hex 32
```
Use the SAME value in Vercel and in your local `.env.local`. Never commit it (it's
gitignored). This secret signs the confirm/unsubscribe links so they can't be forged.

## Step 7 — Give me a postal address for the email footer

US law (CAN-SPAM) requires a real mailing address in the footer of bulk email. Do NOT use
your home address — a cheap PO box or a business address is fine. Tell me the address and
I'll put it in the template. (If you don't have one yet, I'll use a placeholder and you
swap it before the first real send.)

## Step 8 — Final review before go-live (you trigger this)

When everything above is done and I've shipped the code, the launch sequence is:

1. **Re-permission run:** I run a one-time script that emails your existing signups asking
   them to confirm. Only those who click become active. (You watch your inbox for your own
   copy.)
2. **Test send to yourself:** you sign up with your own email, confirm, and check the
   confirmation + welcome emails look right in Gmail.
3. **First digest:** when there are new filings, you open `/admin`, review the draft digest
   (content + recipient count), and click **Send**. Nothing goes out until you click it.
   You'll also get a "digest sent" copy in your inbox as confirmation.

That's it. Steps 1-6 are ~30-45 minutes of dashboard/DNS work. Steps 7-8 are quick.

---

## Quick checklist

- [ ] Resend: remove `trevorthewebdeveloper.com`, add `open-cabinet.org`
- [ ] DNS: add the SPF/DKIM/DMARC/MX records, verify green in Resend
- [ ] Resend: nothing (no segment/topic/audience needed — batch send)
- [ ] Resend: add webhook to `/api/webhooks/resend`, copy signing secret
- [ ] Email forwarding: digest@ / replies@ -> your Gmail
- [ ] Vercel + local: set `RESEND_WEBHOOK_SECRET`, `ALERT_TOKEN_SECRET`
- [ ] Send me a postal address for the footer
- [ ] Final: re-permission run -> test send -> first manual digest
