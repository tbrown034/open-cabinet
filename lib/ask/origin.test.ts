/**
 * Who may call the question box, and who is calling.
 *
 * These cover the route-level findings in the Codex review of Sept. 6: who is
 * allowed to spend the model budget, and how a caller is identified for the
 * per-IP quota.
 */
import { describe, it, expect } from "vitest";
import { allowedAskHosts, isAskOrigin, clientIp, lastHop } from "./origin";

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

