import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import Database from "better-sqlite3";

const ADMIN_EMAIL = "trevorbrown.web@gmail.com";

export const auth = betterAuth({
  database: new Database("./sqlite.db"),
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
