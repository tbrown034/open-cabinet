/**
 * Shared database connection for the entire app.
 *
 * Uses Neon's HTTP driver (@neondatabase/serverless) which sends queries
 * over HTTPS — no persistent TCP connection needed. This is ideal for
 * serverless environments like Vercel where functions spin up/down.
 *
 * drizzle() wraps the raw SQL client with an ORM layer, giving us
 * type-safe queries that match our schema definitions.
 *
 * Both auth (Better Auth) and data tables share this single connection.
 *
 * The connection is created lazily on first use. Next.js evaluates route
 * modules while collecting page data at build time, so a module-scope
 * throw on a missing DATABASE_URL breaks `next build` in any environment
 * without database credentials (CI, fresh clones). Deferring the check to
 * the first query keeps builds env-independent while failing just as
 * loudly at request time.
 */
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";

type Database = ReturnType<typeof drizzle>;

let connection: Database | undefined;

function connect(): Database {
  const connectionString =
    process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL or DATABASE_URL_UNPOOLED must be set in environment variables"
    );
  }

  return drizzle(neon(connectionString));
}

export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    connection ??= connect();
    const value = Reflect.get(connection, prop);
    // Bind methods to the real drizzle instance, not the proxy, so their
    // internal `this` usage keeps working.
    return typeof value === "function" ? value.bind(connection) : value;
  },
});
