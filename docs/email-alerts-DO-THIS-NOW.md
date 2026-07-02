# Email Alerts — Do This Now

Short version of what's on YOU. Ignore the long setup doc; this is the live list.

---

## RIGHT NOW (2 minutes, optional but helpful)

**1. Generate the token secret.** In your terminal:

```
openssl rand -hex 32
```

Copy the output (a 64-character string).

**2. Save it in two places:**

- **Vercel** → open-cabinet project → Settings → Environment Variables → add:
  - Name: `ALERT_TOKEN_SECRET`
  - Value: (the string you just generated)
  - Environment: Production (and Preview if you want)
- **Your local `.env.local`** → add a line:
  - `ALERT_TOKEN_SECRET=（the same string）`

That's the only thing you can usefully do right now.

---

## DONE ALREADY

- Swapped Resend domain to `open-cabinet.org` and verified DNS. ✅

---

## LATER — wait until I tell you (I'll say "the code is live")

**3. Add the webhook.** Resend → Webhooks → Add Webhook:
- URL: `https://open-cabinet.org/api/webhooks/resend`
- Events: `email.bounced`, `email.complained`, `email.delivered`
- Copy the **Signing Secret** → save as `RESEND_WEBHOOK_SECRET` in Vercel + `.env.local`

(Pointless to do before the code ships — it would just error.)

**4. Mailing address.** Set `MAIL_POSTAL_ADDRESS` in `.env.local` + Vercel — it appears in
every email footer (CAN-SPAM). Read from env (not committed) because the repo is public.
**Strongly recommend a PO box, not your home address** — it's published in every email.

**5. Final check.** Sign yourself up, confirm, and eyeball the test email before we go live.

---

## NOT NEEDED (ignore these in Resend)

- Segments, Topics, Audiences, "Add contact" — we don't use any of them.

---

## Heads-up on cost

Free Resend = 100 emails/day. Fine until ~100 subscribers. Past that you'll need the
$20/month plan or the digest won't fully send. Not urgent now.
