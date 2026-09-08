import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { headers } from "next/headers";
import { getDb } from "./db";
import * as schema from "./auth-schema";

const ADMIN_EMAIL = "trevorbrown.web@gmail.com";

function createAuth() {
  return betterAuth({
    // Login starts and returns on the same origin so OAuth state cookies match.
    // Production uses the canonical domain; local development uses BETTER_AUTH_URL.
    baseURL:
      process.env.NODE_ENV === "production"
        ? "https://open-cabinet.org"
        : process.env.BETTER_AUTH_URL || "http://localhost:3003",
    trustedOrigins: [
      // localhost is only trusted outside production so a prod deploy can't be
      // tricked into treating a localhost origin as same-site.
      ...(process.env.NODE_ENV !== "production" ? ["http://localhost:*"] : []),
      "https://open-cabinet.org",
      "https://www.open-cabinet.org",
      ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ],
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema,
    }),
    // Google-only sign-in. requireAdmin separately enforces the email allowlist.
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      },
    },
    plugins: [nextCookies()],
  });
}

let auth: ReturnType<typeof createAuth> | undefined;

/** Initialize authentication only when a request needs it, never during builds. */
export function getAuth() {
  auth ??= createAuth();
  return auth;
}

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
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return null;
  }
  return session;
}
