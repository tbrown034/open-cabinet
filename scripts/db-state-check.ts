/**
 * Read-only prod-DB state check ahead of applying migration 0002.
 * Verifies which tables/columns exist and whether the drizzle journal is
 * populated, so the migration strategy (migrate vs baseline-then-migrate)
 * can be chosen safely. Makes NO writes.
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const url = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("No DATABASE_URL in env");
  const sql = neon(url);

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name`;
  console.log("tables:", tables.map((t) => t.table_name).join(", "));

  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'alert_signups' ORDER BY ordinal_position`;
  console.log("alert_signups cols:", cols.map((c) => c.column_name).join(", "));

  const journal = await sql`
    SELECT count(*) AS n FROM information_schema.tables
    WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'`;
  if (Number(journal[0].n) > 0) {
    const rows = await sql`SELECT id, created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
    console.log("journal rows:", JSON.stringify(rows));
  } else {
    console.log("journal rows: table does not exist");
  }

  const counts = await sql`SELECT status, count(*) AS n FROM alert_signups GROUP BY status`;
  console.log("signup statuses:", JSON.stringify(counts));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
