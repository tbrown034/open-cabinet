/**
 * Endpoint guards, tested without a network or a model.
 *
 * These cover the route-level findings in the Codex review of Sept. 6: who is
 * allowed to spend the model budget, and how a caller is identified for the
 * per-IP quota. The handler itself needs a database and two model calls, so it
 * is exercised end to end against the running dev server instead.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  allowedAskHosts,
  isAskOrigin,
  clientIp,
  lastHop,
  overIpLimit,
  resetAskLimiter,
  limiterSize,
  LIMITER_LIMITS,
  withDeadline,
} from "./route";

function req(headers: Record<string, string>): Request {
  return new Request("https://open-cabinet.org/api/ask", {
    method: "POST",
    headers,
  });
}

// Item 5: the shared origin check allows any *.vercel.app host, which for a
// paid endpoint is any Vercel tenant spending this project's budget.
describe("item 5: origin allowlist", () => {
  const prod = { NODE_ENV: "production" } as NodeJS.ProcessEnv;

  it("allows the production hosts", () => {
    expect(isAskOrigin(req({ origin: "https://open-cabinet.org" }), prod)).toBe(true);
    expect(isAskOrigin(req({ origin: "https://www.open-cabinet.org" }), prod)).toBe(true);
  });

  it("refuses an unrelated Vercel tenant", () => {
    expect(isAskOrigin(req({ origin: "https://attacker.vercel.app" }), prod)).toBe(false);
  });

  it("refuses a host that merely ends with the production domain", () => {
    expect(isAskOrigin(req({ origin: "https://evil-open-cabinet.org" }), prod)).toBe(false);
    expect(isAskOrigin(req({ origin: "https://open-cabinet.org.evil.com" }), prod)).toBe(false);
  });

  it("refuses a request with no origin at all", () => {
    expect(isAskOrigin(req({}), prod)).toBe(false);
  });

  it("refuses localhost in production and allows it outside", () => {
    expect(isAskOrigin(req({ origin: "http://localhost:3013" }), prod)).toBe(false);
    expect(
      isAskOrigin(req({ origin: "http://localhost:3013" }), {
        NODE_ENV: "development",
      } as NodeJS.ProcessEnv)
    ).toBe(true);
  });

  it("takes named preview origins from ALLOWED_ORIGINS", () => {
    const env = {
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://preview-abc.vercel.app, staging.open-cabinet.org",
    } as NodeJS.ProcessEnv;
    expect(allowedAskHosts(env).has("preview-abc.vercel.app")).toBe(true);
    expect(isAskOrigin(req({ origin: "https://preview-abc.vercel.app" }), env)).toBe(true);
    expect(isAskOrigin(req({ origin: "https://staging.open-cabinet.org" }), env)).toBe(true);
    // Naming one preview does not open the rest of the domain.
    expect(isAskOrigin(req({ origin: "https://preview-xyz.vercel.app" }), env)).toBe(false);
  });
});

// Item 9: a caller who rotates X-Forwarded-For walks past the per-IP limit if
// the leftmost entry is trusted, because the client writes that one.
describe("item 9: client identity", () => {
  it("prefers the platform header, which a caller cannot set", () => {
    expect(
      clientIp(
        req({
          "x-vercel-forwarded-for": "9.9.9.9",
          "x-forwarded-for": "1.1.1.1",
          "x-real-ip": "2.2.2.2",
        })
      )
    ).toBe("9.9.9.9");
  });

  it("takes the last hop, not the client-claimed first one", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" }))).toBe("3.3.3.3");
    expect(lastHop("spoofed, spoofed, 8.8.8.8")).toBe("8.8.8.8");
  });

  it("falls back through the header chain and then to unknown", () => {
    expect(clientIp(req({ "x-real-ip": "2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientIp(req({}))).toBe("unknown");
  });

  it("ignores empty hops", () => {
    expect(lastHop("1.1.1.1, , ")).toBe("1.1.1.1");
    expect(lastHop("")).toBe("unknown");
  });
});

// Item 10: a caller who keeps hammering after a 429 was still having every
// rejected request recorded, so rejected traffic grew the limiter unbounded.
describe("item 10: bounded limiter", () => {
  beforeEach(() => resetAskLimiter());

  it("allows exactly the per-hour allowance, then refuses", () => {
    const { PER_IP_PER_HOUR } = LIMITER_LIMITS;
    for (let i = 0; i < PER_IP_PER_HOUR; i++) {
      expect(overIpLimit("caller"), `request ${i + 1}`).toBe(false);
    }
    expect(overIpLimit("caller")).toBe(true);
  });

  it("does not record rejected requests", () => {
    const { PER_IP_PER_HOUR } = LIMITER_LIMITS;
    for (let i = 0; i < PER_IP_PER_HOUR; i++) overIpLimit("caller");
    for (let i = 0; i < 500; i++) overIpLimit("caller");
    // The window still holds only the allowance, not the 500 refusals.
    expect(overIpLimit("caller")).toBe(true);
    expect(limiterSize()).toBe(1);
  });

  it("holds a hard cap on distinct callers", () => {
    const { IP_MAP_MAX_KEYS } = LIMITER_LIMITS;
    for (let i = 0; i < IP_MAP_MAX_KEYS + 500; i++) overIpLimit(`caller-${i}`);
    expect(limiterSize()).toBeLessThanOrEqual(IP_MAP_MAX_KEYS + 1);
  });
});

// Item 12: a phrasing failure must not discard an answer the code already
// computed, and must not hold the request open.
describe("item 12: phrasing deadline", () => {
  it("returns the phrasing when it arrives in time", async () => {
    expect(await withDeadline(async () => "a sentence", 1000)).toBe("a sentence");
  });

  it("returns null instead of throwing when the call fails", async () => {
    const answer = await withDeadline(async () => {
      throw new Error("model exploded");
    }, 1000);
    expect(answer).toBeNull();
  });

  it("returns null instead of hanging when the call is slow", async () => {
    const started = Date.now();
    const answer = await withDeadline(
      () => new Promise((resolve) => setTimeout(() => resolve("late"), 5000)),
      20
    );
    expect(answer).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
