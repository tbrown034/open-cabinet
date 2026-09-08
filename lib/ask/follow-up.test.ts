import { afterEach, expect, it, vi } from "vitest";
import { readFollowUp, signFollowUp } from "./follow-up";

afterEach(() => vi.unstubAllEnvs());
const now = Date.parse("2026-09-08T12:00:00Z");
const followUp = { label: "Only purchases", plan: { filters: { tickers: ["AAPL"] }, aggregate: "count" as const } };

it("accepts only the issued plan, question and official scope", () => {
  vi.stubEnv("ASKAI_COOKIE_SECRET", "test-secret");
  const chip = signFollowUp(followUp, "bessent-scott", now);
  expect(readFollowUp(chip.token, chip.question, "bessent-scott", now)).toEqual(followUp.plan);
  expect(readFollowUp(chip.token, "How many MSFT sales?", "bessent-scott", now)).toBeNull();
  expect(readFollowUp(chip.token, chip.question, "wright-christopher", now)).toBeNull();
  const [payload, mac] = chip.token.split(".");
  const forged = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  forged.plan.filters.tickers = ["MSFT"];
  const changed = `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${mac}`;
  expect(readFollowUp(changed, chip.question, "bessent-scott", now)).toBeNull();
});

it("expires after thirty minutes or at the UTC day boundary", () => {
  vi.stubEnv("ASKAI_COOKIE_SECRET", "test-secret");
  const chip = signFollowUp(followUp, "", now);
  expect(readFollowUp(chip.token, chip.question, "", now + 30 * 60 * 1000)).toBeNull();
  const late = Date.parse("2026-09-08T23:59:00Z");
  const midnightChip = signFollowUp(followUp, "", late);
  expect(readFollowUp(midnightChip.token, midnightChip.question, "", late + 60_000)).toBeNull();
});

it("uses the existing fallback secret, rejects rotation and malformed tokens", () => {
  vi.stubEnv("ASKAI_COOKIE_SECRET", "");
  vi.stubEnv("BETTER_AUTH_SECRET", "fallback");
  const chip = signFollowUp(followUp, "", now);
  expect(readFollowUp(chip.token, chip.question, "", now)).toEqual(followUp.plan);
  vi.stubEnv("BETTER_AUTH_SECRET", "rotated");
  expect(readFollowUp(chip.token, chip.question, "", now)).toBeNull();
  for (const token of [null, {}, "garbage", "a.b.c", "x.y", "x".repeat(4097)]) {
    expect(readFollowUp(token, chip.question, "", now)).toBeNull();
  }
  vi.stubEnv("BETTER_AUTH_SECRET", "");
  expect(() => signFollowUp(followUp, "", now)).toThrow("secret");
});
