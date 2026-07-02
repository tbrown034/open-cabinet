/**
 * One-time re-permission of legacy alert signups.
 *
 * Existing signups predate double opt-in (they were added straight to "active"
 * without confirming). Before any real digest goes out, we ask them to confirm
 * so we have clean consent and prune dead/junk addresses — which also protects
 * deliverability on the very first send.
 *
 * Behavior:
 *  - Targets ONLY rows with status = "active" AND repermission_sent_at IS NULL.
 *  - NEVER touches "unsubscribed" or "suppressed" rows.
 *  - Sets each to "pending" (must re-confirm), stamps repermission_sent_at, and
 *    emails a re-permission link. Re-runnable: stamped rows are skipped, so a
 *    second run won't re-spam anyone.
 *
 * Safety: DRY RUN by default. Pass --send to actually email and write.
 *
 *   pnpm tsx scripts/repermission-alerts.ts            # dry run, no changes
 *   pnpm tsx scripts/repermission-alerts.ts --send     # really do it
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNull, sql } from "drizzle-orm";
import dotenv from "dotenv";

// Load env BEFORE importing any lib module. Several lib modules read process.env
// at import time — email-config bakes POSTAL_ADDRESS into a module-level const —
// so a dotenv.config() that runs after static imports would freeze in the
// "[MAILING ADDRESS PENDING]" placeholder for every footer. The lib modules are
// therefore dynamically imported inside main() (pattern mirrors lib/digest.ts).
dotenv.config({ path: ".env.local" });

const DRY_RUN = !process.argv.includes("--send");
const SEND_DELAY_MS = 700; // be gentle; stay well under Resend's rate limit

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const connectionString =
    process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    console.error("DATABASE_URL or DATABASE_URL_UNPOOLED must be set");
    process.exit(1);
  }
  if (!DRY_RUN && !process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY must be set to actually send (--send).");
    process.exit(1);
  }
  if (!process.env.ALERT_TOKEN_SECRET) {
    console.error("ALERT_TOKEN_SECRET must be set (signs the confirm links).");
    process.exit(1);
  }

  // Import lib modules only now that env is loaded (see top-of-file note).
  const { alertSignups } = await import("../lib/schema");
  const { mintToken } = await import("../lib/tokens");
  const { confirmPageUrl, unsubscribePageUrl, unsubscribeUrl, POSTAL_ADDRESS } =
    await import("../lib/email-config");
  const { buildRepermissionEmail } = await import("../lib/emails");
  const { sendTransactional } = await import("../lib/email-send");

  // Hard guard: a bulk send with a broken CAN-SPAM footer is not re-sendable, so
  // refuse to send if the mailing address is still the placeholder.
  if (!DRY_RUN && POSTAL_ADDRESS === "[MAILING ADDRESS PENDING]") {
    console.error(
      "MAIL_POSTAL_ADDRESS is not set — refusing to send bulk mail with a placeholder CAN-SPAM footer."
    );
    process.exit(1);
  }

  const db = drizzle(neon(connectionString));

  const targets = await db
    .select({ id: alertSignups.id, email: alertSignups.email })
    .from(alertSignups)
    .where(
      and(eq(alertSignups.status, "active"), isNull(alertSignups.repermissionSentAt))
    );

  console.log(`=== Re-permission ${DRY_RUN ? "(DRY RUN)" : "(SENDING)"} ===`);
  console.log(`Legacy active signups needing re-permission: ${targets.length}\n`);

  if (targets.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let sent = 0;
  let failed = 0;

  for (const row of targets) {
    const confirmToken = mintToken(row.id, "confirm");
    const unsubToken = mintToken(row.id, "unsubscribe");
    const mail = buildRepermissionEmail(
      // Human-clickable links point at the interstitial PAGES (scanner-safe);
      // the List-Unsubscribe header below still targets the API route.
      confirmPageUrl(confirmToken),
      unsubscribePageUrl(unsubToken)
    );

    if (DRY_RUN) {
      console.log(`  [dry] would email + set pending: ${row.email} (id ${row.id})`);
      continue;
    }

    const result = await sendTransactional({
      to: row.email,
      kind: "repermission",
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl(unsubToken)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (!result.ok) {
      failed++;
      console.warn(`  FAIL ${row.email}: ${result.error}`);
      // Do NOT stamp/flip on failure, so a re-run retries this row.
      continue;
    }

    // Flip to pending + stamp so a re-run skips this row.
    await db
      .update(alertSignups)
      .set({
        status: "pending",
        confirmedAt: null,
        repermissionSentAt: new Date(),
        updatedAt: sql`now()`,
      })
      .where(eq(alertSignups.id, row.id));

    sent++;
    console.log(`  sent + pending: ${row.email}`);
    await sleep(SEND_DELAY_MS);
  }

  console.log(`\nDone. Sent: ${sent}, Failed: ${failed}, Total: ${targets.length}`);
  if (DRY_RUN) {
    console.log("\nThis was a DRY RUN. Re-run with --send to actually email.");
  }
}

main().catch((err) => {
  console.error("Re-permission failed:", err);
  process.exit(1);
});
