/**
 * One-time migration bootstrap for the live Neon DB.
 *
 * The prod schema was built via drizzle-kit push / runtime shims, so
 * drizzle.__drizzle_migrations is empty even though 0000/0001's objects all
 * exist. A plain `drizzle-kit migrate` would replay 0001's bare CREATE TABLE
 * and fail. Fix: record 0000/0001 as applied (baseline), then let the drizzle
 * migrator apply only 0002 (which is written to be safe on prod — see the
 * header comment in drizzle/0002_loud_night_nurse.sql).
 *
 * Idempotent: baseline inserts are skipped when the journal already has rows,
 * and the migrator itself skips already-applied migrations.
 */
import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

dotenv.config({ path: ".env.local" });

// Journal "when" values from drizzle/meta/_journal.json — must match exactly
// so the migrator's created_at comparison lines up.
const BASELINE = [
  { tag: "0000_nosy_the_hood", when: 1776040574984 },
  { tag: "0001_chilly_winter_soldier", when: 1776040586319 },
];

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { migrate } = await import("drizzle-orm/neon-http/migrator");

  const url = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("No DATABASE_URL in env");
  const sql = neon(url);

  const existing = await sql`SELECT count(*) AS n FROM drizzle.__drizzle_migrations`;
  if (Number(existing[0].n) === 0) {
    for (const m of BASELINE) {
      const hash = createHash("sha256")
        .update(readFileSync(`drizzle/${m.tag}.sql`, "utf8"))
        .digest("hex");
      await sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
                VALUES (${hash}, ${m.when})`;
      console.log(`baselined ${m.tag}`);
    }
  } else {
    console.log(`journal already has ${existing[0].n} rows — skipping baseline`);
  }

  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("migrate complete");

  // Verify the outcome before declaring success.
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'alert_signups' ORDER BY ordinal_position`;
  console.log("alert_signups cols:", cols.map((c) => c.column_name).join(", "));
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('digest_runs', 'notified_filings', 'email_sends')`;
  console.log("new tables:", tables.map((t) => t.table_name).join(", "));
  const statuses = await sql`SELECT status, count(*) AS n FROM alert_signups GROUP BY status`;
  console.log("signup statuses (must still be 35 active):", JSON.stringify(statuses));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
