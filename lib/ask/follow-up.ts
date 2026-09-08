import { createHmac, timingSafeEqual } from "node:crypto";
import type { FollowUp } from "./plan";

// A chip is a server-built query, not an arbitrary plan supplied by a browser.
// Reuse the existing alpha secret; no new service, table or configuration.
function signature(payload: string): Buffer | null {
  const secret = process.env.ASKAI_COOKIE_SECRET || process.env.BETTER_AUTH_SECRET;
  return secret ? createHmac("sha256", secret).update(`ask-follow-up-v1:${payload}`).digest() : null;
}

export function signFollowUp(followUp: FollowUp, scope: string, now = Date.now()) {
  const question = `Follow-up: ${followUp.label}`;
  // Date-based chips must not survive a UTC day change.
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(24, 0, 0, 0);
  const expiresAt = Math.min(now + 30 * 60 * 1000, tomorrow.getTime());
  const payload = Buffer.from(JSON.stringify({ question, scope, plan: followUp.plan, expiresAt })).toString("base64url");
  const mac = signature(payload);
  if (!mac) throw new Error("Ask follow-up signing secret is unavailable");
  return { label: followUp.label, question, token: `${payload}.${mac.toString("base64url")}` };
}

/** Only the exact question/scope issued with this chip may use its plan. */
export function readFollowUp(token: unknown, question: string, scope: string, now = Date.now()): unknown | null {
  if (typeof token !== "string" || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, mac] = parts;
  const expected = signature(payload);
  const received = Buffer.from(mac, "base64url");
  if (!expected || received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (value.question !== question || value.scope !== scope || typeof value.expiresAt !== "number" || value.expiresAt <= now) return null;
    return value.plan ?? null;
  } catch {
    return null;
  }
}
