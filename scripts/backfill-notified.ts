/**
 * Seed the notified_filings ledger with every historical sourceFilings URL
 * so that digest #1 doesn't email subscribers about the entire backlog.
 *
 * Without this, the first real digest would include all 130+ filings already
 * on the site — overwhelming subscribers and making the feature look broken.
 * Running this once marks all existing filings as "already notified" so only
 * genuinely new filings (added after the backfill) will appear in digests.
 *
 * Behavior:
 *   Dry run (default): prints per-official filing counts and total. No writes.
 *   --seed: actually inserts rows into notified_filings.
 *
 * Safety: onConflictDoNothing on the UNIQUE filing_url, so re-running is safe.
 *
 * Usage:
 *   pnpm backfill-notified             # dry run
 *   pnpm backfill-notified --seed      # insert rows
 */

// dotenv MUST be configured before any lib import that reads process.env at
// module scope. We use dynamic import() for db + schema for the same reason —
// the established pattern from lib/digest.ts (buildDigest function).
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "fs";
import path from "path";

const OFFICIALS_DIR = path.join(process.cwd(), "data", "officials");
const DRY_RUN = !process.argv.includes("--seed");

interface SourceFiling {
  url: string;
  date?: string;
  label?: string;
}

interface OfficialJson {
  slug: string;
  name?: string;
  sourceFilings?: SourceFiling[];
}

/** Collect all (officialSlug, filingUrl) pairs from the static JSON files. */
function collectFilings(): Array<{ slug: string; url: string }> {
  const files = fs
    .readdirSync(OFFICIALS_DIR)
    .filter((f) => f.endsWith(".json"));

  const rows: Array<{ slug: string; url: string }> = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(OFFICIALS_DIR, file), "utf-8");
    const data: OfficialJson = JSON.parse(raw);
    const slug = data.slug ?? file.replace(".json", "");

    for (const sf of data.sourceFilings ?? []) {
      if (sf.url) {
        rows.push({ slug, url: sf.url });
      }
    }
  }

  return rows;
}

async function main() {
  const connectionString =
    process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;

  if (!connectionString) {
    console.error("DATABASE_URL or DATABASE_URL_UNPOOLED must be set in .env.local");
    process.exit(1);
  }

  // Dynamic imports after dotenv so DB module reads the env vars we just set.
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { notifiedFilings } = await import("../lib/schema");

  const db = drizzle(neon(connectionString));

  console.log(`=== Backfill notified_filings ${DRY_RUN ? "(DRY RUN)" : "(SEEDING)"} ===\n`);

  const rows = collectFilings();

  // Print per-official breakdown so the operator can verify coverage.
  const bySlug = new Map<string, number>();
  for (const r of rows) {
    bySlug.set(r.slug, (bySlug.get(r.slug) ?? 0) + 1);
  }
  for (const [slug, count] of [...bySlug.entries()].sort()) {
    console.log(`  ${slug}: ${count} filing(s)`);
  }
  console.log(`\nTotal URLs to backfill: ${rows.length}`);

  if (DRY_RUN) {
    console.log("\nDry run complete. Re-run with --seed to insert rows.");
    return;
  }

  // Insert with onConflictDoNothing — re-runnable without side effects.
  // digestRunId null = pre-existing filing, not from an actual digest send.
  const result = await db
    .insert(notifiedFilings)
    .values(
      rows.map((r) => ({
        filingUrl: r.url,
        officialSlug: r.slug,
        digestRunId: null,
      }))
    )
    .onConflictDoNothing({ target: notifiedFilings.filingUrl })
    .returning({ id: notifiedFilings.id });

  const inserted = result.length;
  const alreadyPresent = rows.length - inserted;

  console.log(`\nInserted:       ${inserted}`);
  console.log(`Already present: ${alreadyPresent}`);
  console.log(`Total:           ${rows.length}`);
  console.log("\nBackfill complete. Digest #1 will only include NEW filings.");
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
