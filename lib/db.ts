import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";

type Database = ReturnType<typeof drizzle>;
let connection: Database | undefined;

/**
 * Reuse one Neon HTTP/Drizzle client per server process. Call inside a request
 * or script, not at module scope: builds must work without database credentials.
 */
export function getDb(): Database {
  if (connection) return connection;

  const connectionString =
    process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL or DATABASE_URL_UNPOOLED must be set in environment variables"
    );
  }

  connection = drizzle(neon(connectionString));
  return connection;
}
