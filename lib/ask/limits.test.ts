/**
 * Throttles and deadlines.
 *
 * These cover the route-level findings in the Codex review of Sept. 6: a
 * limiter that grew on rejected traffic, and a phrasing call that could take
 * a computed answer down with it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  overIpLimit,
  resetAskLimiter,
  limiterSize,
  LIMITER_LIMITS,
  withDeadline,
} from "./limits";

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
