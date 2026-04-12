import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./auth-schema";

const sql = neon(process.env.DATABASE_URL! || process.env.DATABASE_URL_UNPOOLED!);
const db = drizzle(sql);

const ADMIN_EMAIL = "trevorbrown.web@gmail.com";

export const auth = betterAuth({
  trustedOrigins: ["http://localhost:*"],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  plugins: [nextCookies()],
});

/**
 * Check if a user email is the whitelisted admin.
 */
export function isAdmin(email: string | undefined | null): boolean {
  return email === ADMIN_EMAIL;
}
