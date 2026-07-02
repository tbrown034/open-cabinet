/**
 * Signed, tamper-proof tokens for email confirm/unsubscribe links.
 *
 * Why HMAC and not a random value stored in the DB? The repo is public, so
 * security can never rely on hidden code — only on a secret key. An HMAC token
 * is `payload.signature`, where the signature is HMAC-SHA256(secret, payload).
 * Anyone can read how it's built, but without ALERT_TOKEN_SECRET they cannot
 * forge a valid signature. Verification is fully STATELESS — we do not store the
 * token in the DB and do not look it up. (The alertSignups.confirmToken /
 * unsubscribeToken columns are reserved for a future store-and-revoke scheme;
 * they are currently unused, and a confirm link is valid for its full TTL.)
 *
 * Two purposes are namespaced into the token ("confirm" vs "unsubscribe") so a
 * confirm link can never be replayed as an unsubscribe link or vice-versa.
 *
 * Determinism matters for the digest send: an unsubscribe token for a given id
 * is STABLE (no expiry, no randomness), so a crash-safe re-send produces the
 * byte-identical email Resend's idempotency requires. Confirm tokens carry an
 * expiry because a stale confirm link should die.
 */
import { createHmac, timingSafeEqual } from "crypto";

export type TokenPurpose = "confirm" | "unsubscribe";

/** Confirm links expire after 30 days; unsubscribe links never expire. */
const CONFIRM_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface TokenPayload {
  id: number; // alertSignups.id
  p: TokenPurpose;
  exp?: number; // epoch ms; absent = never expires
}

function getSecret(): string {
  const secret = process.env.ALERT_TOKEN_SECRET;
  if (!secret) {
    throw new Error("ALERT_TOKEN_SECRET is not set");
  }
  return secret;
}

/** URL-safe base64 with no padding, so tokens drop straight into a query string. */
function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function sign(payloadB64: string): string {
  return base64url(createHmac("sha256", getSecret()).update(payloadB64).digest());
}

/**
 * Build a token for a signup row. `now` is injectable so tests are deterministic
 * (and so callers can pass a frozen timestamp).
 */
export function mintToken(
  id: number,
  purpose: TokenPurpose,
  now: number = Date.now()
): string {
  const payload: TokenPayload = { id, p: purpose };
  if (purpose === "confirm") {
    payload.exp = now + CONFIRM_TTL_MS;
  }
  const payloadB64 = base64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export interface VerifyResult {
  valid: boolean;
  id?: number;
}

/**
 * Verify a token against an expected purpose. Returns the signup id on success.
 * Fails closed on any tampering, wrong purpose, or expiry. Signature comparison
 * is constant-time to avoid leaking via timing.
 */
export function verifyToken(
  token: string,
  expectedPurpose: TokenPurpose,
  now: number = Date.now()
): VerifyResult {
  if (typeof token !== "string" || !token.includes(".")) {
    return { valid: false };
  }
  const [payloadB64, providedSig] = token.split(".");
  if (!payloadB64 || !providedSig) return { valid: false };

  // Recompute the signature and compare in constant time. Length-guard first
  // because timingSafeEqual throws on length mismatch.
  const expectedSig = sign(payloadB64);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false };
  }

  let payload: TokenPayload;
  try {
    // Restore base64 padding before decoding (we strip it when minting).
    const b64 = payloadB64.replaceAll("-", "+").replaceAll("_", "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return { valid: false };
  }

  // A validly-signed token could still decode to a non-object; guard before
  // reading fields so we fail closed instead of throwing.
  if (!payload || typeof payload !== "object") return { valid: false };
  if (payload.p !== expectedPurpose) return { valid: false };
  if (typeof payload.id !== "number") return { valid: false };
  if (payload.exp !== undefined && now > payload.exp) return { valid: false };

  return { valid: true, id: payload.id };
}
