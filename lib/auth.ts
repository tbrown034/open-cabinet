import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./auth-schema";

const ADMIN_EMAIL = "trevorbrown.web@gmail.com";

export const auth = betterAuth({
  trustedOrigins: [
    "http://localhost:*",
    "https://open-cabinet.org",
    "https://www.open-cabinet.org",
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ],
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
