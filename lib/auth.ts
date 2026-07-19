import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { headers } from "next/headers";
import { db } from "./db";
import * as schema from "./auth-schema";

const ADMIN_EMAIL = "trevorbrown.web@gmail.com";

export const auth = betterAuth({
  trustedOrigins: [
    // localhost is only trusted outside production so a prod deploy can't be
    // tricked into treating a localhost origin as same-site.
    ...(process.env.NODE_ENV !== "production" ? ["http://localhost:*"] : []),
    "https://open-cabinet.org",
    "https://www.open-cabinet.org",
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  // No email/password auth: admin access is Google-OAuth-only, gated to the
  // whitelisted ADMIN_EMAIL below. Leaving password signup enabled would allow
  // anyone to self-register an account (no email verification was configured),
  // so the whole block is removed rather than merely disabled.
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

/**
 * Shared admin guard for API routes: resolves the current session and returns it
 * only if it belongs to the whitelisted admin, else null. Replaces the
 * copy-pasted per-route checkAdmin() helpers so the check lives in one place.
 */
export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return null;
  }
  return session;
}
