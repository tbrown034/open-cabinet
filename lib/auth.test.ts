import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const handler = vi.fn(async () => new Response("auth response"));
  const getSession = vi.fn();
  return {
    handler,
    getSession,
    betterAuth: vi.fn(() => ({ handler, api: { getSession } })),
    drizzleAdapter: vi.fn(() => "adapter"),
    getDb: vi.fn(() => "database"),
  };
});

vi.mock("better-auth", () => ({ betterAuth: mocks.betterAuth }));
vi.mock("better-auth/adapters/drizzle", () => ({ drizzleAdapter: mocks.drizzleAdapter }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", undefined);
  vi.stubEnv("DATABASE_URL_UNPOOLED", undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("lazy authentication", () => {
  it("imports the auth route without initializing auth or the database, then handles requests", async () => {
    const { GET, POST } = await import("../app/api/auth/[...all]/route");
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.betterAuth).not.toHaveBeenCalled();

    const request = new Request("http://localhost:3003/api/auth/get-session");
    expect(await (await GET(request)).text()).toBe("auth response");
    await POST(request);
    expect(mocks.handler).toHaveBeenCalledWith(request);
    expect(mocks.getDb).toHaveBeenCalledTimes(1);
    expect(mocks.betterAuth).toHaveBeenCalledTimes(1);
  });

  it("keeps the admin allowlist when using the lazy instance", async () => {
    const { requireAdmin } = await import("./auth");
    mocks.getSession.mockResolvedValueOnce({ user: { email: "someone@example.com" } });
    expect(await requireAdmin()).toBeNull();
    const admin = { user: { email: "trevorbrown.web@gmail.com" } };
    mocks.getSession.mockResolvedValueOnce(admin);
    expect(await requireAdmin()).toBe(admin);
    expect(mocks.betterAuth).toHaveBeenCalledTimes(1);
  });
});
