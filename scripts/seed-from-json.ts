/**
 * Seed the Neon PostgreSQL database from static JSON files.
 *
 * Reads all official JSON files in data/officials/ and news-coverage.json,
 * then inserts everything into the database tables defined in lib/schema.ts.
 *
 * This is a one-time migration script. After seeding, the DB becomes the
 * authoritative data store. JSON files remain as the build cache and
 * git-tracked audit trail.
 *
 * Run: pnpm run seed
 */
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { officials, transactions, newsCoverage } from "../lib/schema";
import type { OfficialData } from "../lib/types";
import dotenv from "dotenv";

// Load .env.local for local script execution
dotenv.config({ path: ".env.local" });

const connectionString =
  process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;

if (!connectionString) {
  console.error("DATABASE_URL or DATABASE_URL_UNPOOLED must be set");
  process.exit(1);
}

const sql = neon(connectionString);
const db = drizzle(sql);

async function seedOfficials() {
  const dataDir = join(process.cwd(), "data", "officials");
  const files = await readdir(dataDir);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  console.log(`Found ${jsonFiles.length} official JSON files`);

  let totalOfficials = 0;
  let totalTransactions = 0;

  for (const file of jsonFiles) {
    const raw = await readFile(join(dataDir, file), "utf-8");
    const data: OfficialData = JSON.parse(raw);

    // Insert official and get back the generated id
    const [inserted] = await db
      .insert(officials)
      .values({
        name: data.name,
        slug: data.slug,
        title: data.title,
        agency: data.agency,
        level: data.level,
        party: data.party || null,
        filingType: data.filingType,
        photoUrl: data.photoUrl || null,
        summary: data.summary || null,
        confirmedDate: data.confirmedDate || null,
        tookOfficeDate: data.tookOfficeDate || null,
        ethicsAgreementDate: data.ethicsAgreementDate || null,
        departedDate: data.departedDate || null,
        mostRecentFilingDate: data.mostRecentFilingDate || null,
      })
      .onConflictDoNothing() // Skip if slug already exists
      .returning({ id: officials.id, slug: officials.slug });

    if (!inserted) {
      console.log(`  Skipped ${data.slug} (already exists)`);
      continue;
    }

    totalOfficials++;

    // Insert transactions in batches of 50 (Neon HTTP has payload limits).
    // Each transaction gets a rowIndex (its position in the array) so that
    // legitimate duplicate lot sales — same (description, date, type, amount)
    // but different lots — get distinct UNIQUE keys in the database.
    const txBatchSize = 50;
    let txInserted = 0;

    for (let i = 0; i < data.transactions.length; i += txBatchSize) {
      const batch = data.transactions.slice(i, i + txBatchSize);
      const values = batch.map((tx, j) => ({
        officialId: inserted.id,
        description: tx.description,
        ticker: tx.ticker || null,
        type: tx.type,
        date: tx.date,
        amount: tx.amount,
        lateFilingFlag: tx.lateFilingFlag,
        rowIndex: i + j, // Global position distinguishes duplicate lots
        notes: tx.notes || null,
      }));

      await db
        .insert(transactions)
        .values(values)
        .onConflictDoNothing(); // Skip only true duplicates (same key + rowIndex)

      txInserted += batch.length;
    }

    totalTransactions += txInserted;
    console.log(
      `  ${data.slug}: ${txInserted} transactions (id: ${inserted.id})`
    );
  }

  console.log(
    `\nOfficials seeded: ${totalOfficials}, Transactions seeded: ${totalTransactions}`
  );
}

async function seedNews() {
  const newsPath = join(process.cwd(), "data", "news-coverage.json");

  let newsData: Array<{
    official: string;
    headline: string;
    source: string;
    date: string;
    url: string;
    relevance: string;
  }>;

  try {
    const raw = await readFile(newsPath, "utf-8");
    newsData = JSON.parse(raw);
  } catch {
    console.log("No news-coverage.json found, skipping news seed");
    return;
  }

  console.log(`\nSeeding ${newsData.length} news articles...`);

  // Insert in batches
  const batchSize = 20;
  let inserted = 0;

  for (let i = 0; i < newsData.length; i += batchSize) {
    const batch = newsData.slice(i, i + batchSize);
    const values = batch.map((item) => ({
      officialSlug: item.official,
      headline: item.headline,
      source: item.source,
      date: item.date,
      url: item.url,
      relevance: item.relevance,
    }));

    await db.insert(newsCoverage).values(values).onConflictDoNothing();
    inserted += batch.length;
  }

  console.log(`News articles seeded: ${inserted}`);
}

async function main() {
  console.log("=== Open Cabinet Database Seed ===\n");
  console.log("Source: data/officials/*.json + data/news-coverage.json");
  console.log("Target: Neon PostgreSQL\n");

  await seedOfficials();
  await seedNews();

  console.log("\n=== Seed complete ===");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
