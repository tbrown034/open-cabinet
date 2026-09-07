/**
 * Alpha gate for /askai and POST /api/ask.
 *
 * One shared password, ASKAI_PASSWORD, set in the environment. A correct
 * password sets a cookie holding an HMAC of the password under
 * ASKAI_COOKIE_SECRET (BETTER_AUTH_SECRET is the fallback), so the cookie
 * never carries the password itself, and rotating either secret logs
 * everyone out. Unset password means the feature is closed everywhere.
 *
 * This is an access gate for a paid, unfinished feature shown to a few
 * people, not user authentication: there are no accounts and nothing is
 * stored per person.
 */
import { createHmac, timingSafeEqual } from "crypto";

export const ASKAI_COOKIE = "askai_alpha";

function secret(env: NodeJS.ProcessEnv): string | null {
  return env.ASKAI_COOKIE_SECRET || env.BETTER_AUTH_SECRET || null;
}

export function askaiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ASKAI_PASSWORD && secret(env));
}

/** The cookie value a correct password earns; null when the feature is closed. */
export function askaiToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const pw = env.ASKAI_PASSWORD;
  const s = secret(env);
  if (!pw || !s) return null;
  return createHmac("sha256", s).update(`askai:${pw}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function passwordMatches(candidate: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const pw = env.ASKAI_PASSWORD;
  if (!pw) return false;
  return safeEqual(candidate, pw);
}

export function hasAskaiAccess(cookieValue: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const token = askaiToken(env);
  if (!token || !cookieValue) return false;
  return safeEqual(cookieValue, token);
}

/** Read the cookie off a raw Request (route handlers). */
export function requestHasAskaiAccess(request: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  const header = request.headers.get("cookie") ?? "";
  const match = header.split(/;\s*/).find((c) => c.startsWith(`${ASKAI_COOKIE}=`));
  return hasAskaiAccess(match ? decodeURIComponent(match.slice(ASKAI_COOKIE.length + 1)) : undefined, env);
}
