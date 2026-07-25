/**
 * Send the pending digest to ONE address, for eyeballing in a real inbox.
 *
 * This is not the real send. It deliberately cannot become one:
 *
 *  - the recipient is pinned to ADMIN_EMAIL and any other address aborts
 *  - it never writes to notified_filings, so the digest stays pending and the
 *    real send still has every filing to announce
 *  - it never reads the subscriber table
 *
 * The real subscriber send lives behind the admin panel (/admin), which owns
 * the ledger writes and the frozen-payload replay.
 *
 *   npx tsx scripts/send-digest-test.ts            # dry run, prints only
 *   npx tsx scripts/send-digest-test.ts --send     # actually sends
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const DO_SEND = process.argv.includes("--send");

async function main() {
  const { ADMIN_EMAIL, POSTAL_ADDRESS } = await import("@/lib/email-config");
  const { buildDigest, digestIdempotencyKey } = await import("@/lib/digest");
  const { buildDigestEmail } = await import("@/lib/emails");
  const { getDigestLede } = await import("@/lib/digest-lede");
  const { sendTransactional } = await import("@/lib/email-send");

  if (ADMIN_EMAIL !== "trevorbrown.web@gmail.com") {
    throw new Error(`Refusing to send: unexpected recipient ${ADMIN_EMAIL}`);
  }
  if (POSTAL_ADDRESS.includes("PENDING")) {
    throw new Error("Refusing to send: MAIL_POSTAL_ADDRESS is unset");
  }

  const digest = await buildDigest();
  if (digest.items.length === 0) {
    console.log("Nothing pending. No email built.");
    return;
  }

  const sendKey = digestIdempotencyKey(digest.filingUrls);
  const lede = (await getDigestLede(sendKey)) ?? undefined;
  const email = buildDigestEmail(
    digest.items,
    // A preview token, not a real unsubscribe grant — this address is not a
    // subscriber and nothing here should be able to mutate a subscription.
    "https://open-cabinet.org/alerts/unsubscribe?token=PREVIEW",
    {
      alsoNew: digest.alsoNew,
      trackedOfficialCount: digest.trackedOfficialCount,
      lede,
    }
  );

  console.log(`to:       ${ADMIN_EMAIL}`);
  console.log(`subject:  ${email.subject}`);
  console.log(`officials:${digest.items.length}`);
  console.log(`new trades:${digest.items.reduce((s, i) => s + i.newCount, 0)}`);
  console.log(`lede:     ${lede ? "attached" : "none"}`);
  console.log(`sendKey:  ${sendKey}`);

  if (!DO_SEND) {
    console.log("\nDry run. Pass --send to deliver.");
    return;
  }

  const result = await sendTransactional({
    to: ADMIN_EMAIL,
    subject: `[TEST] ${email.subject}`,
    html: email.html,
    text: email.text,
    kind: "digest",
    // Unique per run so repeat tests are never deduped by Resend, and so this
    // can never collide with the real digest's idempotency key.
    idempotencyKey: `test-${sendKey}-${process.pid}`,
  });

  console.log(result.ok ? `SENT id=${result.id}` : `FAILED ${result.error}`);
  if (!result.ok) process.exitCode = 1;
}

main();
