import { describe, it, expect, beforeAll } from "vitest";
import { mintToken, verifyToken } from "./tokens";

// The token utility reads ALERT_TOKEN_SECRET at call time.
beforeAll(() => {
  process.env.ALERT_TOKEN_SECRET = "test-secret-do-not-use-in-prod";
});

describe("mintToken / verifyToken", () => {
  it("round-trips a confirm token and returns the id", () => {
    const token = mintToken(42, "confirm");
    const result = verifyToken(token, "confirm");
    expect(result.valid).toBe(true);
    expect(result.id).toBe(42);
  });

  it("round-trips an unsubscribe token", () => {
    const token = mintToken(7, "unsubscribe");
    expect(verifyToken(token, "unsubscribe")).toEqual({ valid: true, id: 7 });
  });

  it("rejects a token used for the wrong purpose", () => {
    const confirm = mintToken(1, "confirm");
    expect(verifyToken(confirm, "unsubscribe").valid).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const token = mintToken(1, "confirm");
    const [, sig] = token.split(".");
    // Swap in a different id payload but keep the old signature.
    const forgedPayload = Buffer.from(JSON.stringify({ id: 999, p: "confirm" }))
      .toString("base64")
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    expect(verifyToken(`${forgedPayload}.${sig}`, "confirm").valid).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const token = mintToken(1, "confirm");
    const [payload] = token.split(".");
    expect(verifyToken(`${payload}.deadbeef`, "confirm").valid).toBe(false);
  });

  it("rejects garbage and malformed tokens", () => {
    expect(verifyToken("", "confirm").valid).toBe(false);
    expect(verifyToken("no-dot", "confirm").valid).toBe(false);
    expect(verifyToken("a.b.c", "confirm").valid).toBe(false);
  });

  it("expires confirm tokens after their TTL", () => {
    const t0 = 1_000_000_000_000;
    const token = mintToken(5, "confirm", t0);
    // Valid just before expiry, invalid just after 30 days.
    const justBefore = t0 + 30 * 24 * 60 * 60 * 1000 - 1000;
    const justAfter = t0 + 30 * 24 * 60 * 60 * 1000 + 1000;
    expect(verifyToken(token, "confirm", justBefore).valid).toBe(true);
    expect(verifyToken(token, "confirm", justAfter).valid).toBe(false);
  });

  it("never expires unsubscribe tokens (stable for crash-safe re-sends)", () => {
    const t0 = 1_000_000_000_000;
    const token = mintToken(5, "unsubscribe", t0);
    const farFuture = t0 + 10 * 365 * 24 * 60 * 60 * 1000;
    expect(verifyToken(token, "unsubscribe", farFuture).valid).toBe(true);
  });

  it("produces a deterministic unsubscribe token (same id -> same token)", () => {
    // Critical for Resend idempotency: a re-sent digest must be byte-identical.
    expect(mintToken(123, "unsubscribe")).toBe(mintToken(123, "unsubscribe"));
  });
});
