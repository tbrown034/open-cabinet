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
 */
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";

const connectionString =
  process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL or DATABASE_URL_UNPOOLED must be set in environment variables"
  );
}

const sql = neon(connectionString);
export const db = drizzle(sql);
