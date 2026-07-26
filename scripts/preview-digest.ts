/**
 * Build the pending digest and write its HTML + text to disk for review.
 * Read-only: touches no ledger rows, sends nothing.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { writeFileSync } from "node:fs";

const OUT = process.argv[2] ?? "/tmp/digest";

async function main() {
  const { buildDigest, digestIdempotencyKey } = await import("@/lib/digest");
  const { buildDigestEmail } = await import("@/lib/emails");
  const { getDigestLede } = await import("@/lib/digest-lede");

  const scope = process.env.DIGEST_SINCE || undefined;
  const digest = await buildDigest(scope ? { ingestedOnOrAfter: scope } : {});
  // Same resolution the admin send uses: the lede only attaches when its
  // stored sendKey still matches this digest's filing set.
  const sendKey = digestIdempotencyKey(digest.filingUrls);
  const lede = (await getDigestLede(sendKey)) ?? undefined;

  console.log("=== DIGEST CONTENT ===");
  console.log("items:", digest.items.length);
  for (const item of digest.items) {
    console.log(
      `  ${item.name} | ${item.newCount} new | ${item.trades.length} rows shown`
    );
    console.log(`     ${item.title} · ${item.agency}`);
    for (const t of item.trades.slice(0, 4)) {
      console.log(
        `       ${t.type.padEnd(14)} ${t.amount.padEnd(22)} ${t.lateFilingFlag ? "LATE " : "     "}${t.description.slice(0, 44)}`
      );
    }
    if (item.trades.length > 4) {
      console.log(`       ...${item.trades.length - 4} more rows`);
    }
  }
  console.log(
    "alsoNew:",
    (digest.alsoNew ?? []).map((o) => `${o.name} (${o.newTradeCount})`).join(", ") || "none"
  );
  console.log("trackedOfficialCount:", digest.trackedOfficialCount);
  console.log("filingUrls:", digest.filingUrls?.length ?? 0);

  const email = buildDigestEmail(
    digest.items,
    "https://open-cabinet.org/alerts/unsubscribe?token=PREVIEW",
    {
      alsoNew: digest.alsoNew,
      trackedOfficialCount: digest.trackedOfficialCount,
      lede,
    }
  );

  console.log("\n=== SUBJECT ===");
  console.log(email.subject);
  console.log("\n=== LEDE ===");
  console.log(lede || "(none — sendKey mismatch or no file)");
  console.log("sendKey:", sendKey);

  writeFileSync(`${OUT}.html`, email.html);
  writeFileSync(`${OUT}.txt`, email.text);
  console.log(`\nwrote ${OUT}.html (${email.html.length} bytes)`);
  console.log(`wrote ${OUT}.txt (${email.text.length} bytes)`);
}

main();
