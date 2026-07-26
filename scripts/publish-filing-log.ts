/**
 * Publish the pending digest to the public filing log at /filings.
 *
 * Publishing and mailing are separate on purpose. This writes a committed
 * JSON entry so the web version can go up as soon as a batch is parsed,
 * while the email waits for a reasonable hour. It sends nothing, touches no
 * subscriber, and writes no ledger row — the digest stays pending, so the
 * email still has every filing to announce when it goes.
 *
 *   npx tsx scripts/publish-filing-log.ts                    # dry run
 *   DIGEST_SINCE=2026-07-25 npx tsx scripts/publish-filing-log.ts --write
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const DO_WRITE = process.argv.includes("--write");

async function main() {
  const { buildDigest, digestIdempotencyKey } = await import("@/lib/digest");
  const { getDigestLede } = await import("@/lib/digest-lede");
  const { FILING_LOG_DIR } = await import("@/lib/updates");

  const scope = process.env.DIGEST_SINCE || undefined;
  const digest = await buildDigest(scope ? { ingestedOnOrAfter: scope } : {});

  if (digest.items.length === 0) {
    console.log("Nothing pending. Nothing to publish.");
    return;
  }

  // The entry is dated by the day it covers, which is the ingest scope when
  // one is given. Passing it explicitly keeps the filename deterministic
  // rather than depending on when the script happens to run.
  const date = process.env.LOG_DATE || scope;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(
      "Set DIGEST_SINCE (or LOG_DATE) to the YYYY-MM-DD this entry covers."
    );
  }

  const lede =
    (await getDigestLede(digestIdempotencyKey(digest.filingUrls))) ?? undefined;

  const entry = {
    date,
    lede,
    items: digest.items,
    alsoNew: digest.alsoNew,
    trackedOfficialCount: digest.trackedOfficialCount,
  };

  const tradeCount = digest.items.reduce((s, i) => s + i.newCount, 0);
  console.log(`date:       ${date}`);
  console.log(`officials:  ${digest.items.length}`);
  console.log(`new trades: ${tradeCount}`);
  console.log(`lede:       ${lede ? "attached" : "none"}`);
  console.log(`also filed: ${digest.alsoNew?.length ?? 0}`);

  if (!DO_WRITE) {
    console.log("\nDry run. Pass --write to publish.");
    return;
  }

  mkdirSync(FILING_LOG_DIR, { recursive: true });
  const file = path.join(FILING_LOG_DIR, `${date}.json`);
  writeFileSync(file, `${JSON.stringify(entry, null, 2)}\n`);
  console.log(`\nwrote ${file}`);
  console.log("Commit it and deploy to publish. No email was sent.");
}

main();
