import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { neon, drizzle, connection } = vi.hoisted(() => {
  const connection = { select: vi.fn() };
  return {
    connection,
    neon: vi.fn(() => "http-client"),
    drizzle: vi.fn(() => connection),
  };
});

vi.mock("@neondatabase/serverless", () => ({ neon }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", undefined);
  vi.stubEnv("DATABASE_URL_UNPOOLED", undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("database initialization", () => {
  it("allows module imports without credentials and fails only when requested", async () => {
    const { getDb } = await import("./db");
    expect(neon).not.toHaveBeenCalled();
    expect(() => getDb()).toThrow("DATABASE_URL or DATABASE_URL_UNPOOLED must be set");
    expect(drizzle).not.toHaveBeenCalled();
  });

  it("prefers DATABASE_URL and reuses the same client across queries", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://primary.example/test");
    vi.stubEnv("DATABASE_URL_UNPOOLED", "postgresql://fallback.example/test");
    const { getDb } = await import("./db");
    expect(getDb()).toBe(connection);
    expect(getDb()).toBe(connection);
    expect(neon).toHaveBeenCalledExactlyOnceWith("postgresql://primary.example/test");
    expect(drizzle).toHaveBeenCalledExactlyOnceWith("http-client");
  });

  it("supports the unpooled URL when DATABASE_URL is empty", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL_UNPOOLED", "postgresql://fallback.example/test");
    const { getDb } = await import("./db");
    expect(getDb()).toBe(connection);
    expect(neon).toHaveBeenCalledExactlyOnceWith("postgresql://fallback.example/test");
  });

  it("does not cache a failed initialization", async () => {
    const { getDb } = await import("./db");
    expect(() => getDb()).toThrow();
    vi.stubEnv("DATABASE_URL", "postgresql://primary.example/test");
    expect(getDb()).toBe(connection);
  });
});
