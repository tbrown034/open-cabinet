import { describe, expect, it } from "vitest";
import { askaiEnabled, askaiToken, hasAskaiAccess, passwordMatches, requestHasAskaiAccess, ASKAI_COOKIE } from "./askai-access";

const env = { ASKAI_PASSWORD: "open-sesame", ASKAI_COOKIE_SECRET: "s3cret" } as unknown as NodeJS.ProcessEnv;

describe("askai alpha gate", () => {
  it("is closed when the password is unset", () => {
    expect(askaiEnabled({} as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(askaiToken({ ASKAI_COOKIE_SECRET: "x" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(hasAskaiAccess("anything", {} as NodeJS.ProcessEnv)).toBe(false);
  });
  it("checks the password and issues a token that is not the password", () => {
    expect(passwordMatches("open-sesame", env)).toBe(true);
    expect(passwordMatches("open-sesame ", env)).toBe(false);
    const token = askaiToken(env)!;
    expect(token).not.toContain("sesame");
    expect(hasAskaiAccess(token, env)).toBe(true);
    expect(hasAskaiAccess(token.slice(1), env)).toBe(false);
  });
  it("reads the cookie from a request and rejects a token minted under another secret", () => {
    const token = askaiToken(env)!;
    const req = new Request("http://localhost/api/ask", { headers: { cookie: `a=b; ${ASKAI_COOKIE}=${token}` } });
    expect(requestHasAskaiAccess(req, env)).toBe(true);
    expect(requestHasAskaiAccess(req, { ...env, ASKAI_COOKIE_SECRET: "other" })).toBe(false);
    expect(requestHasAskaiAccess(new Request("http://localhost/api/ask"), env)).toBe(false);
  });
});

import { passwordAttemptAllowed, PASSWORD_ATTEMPTS_PER_HOUR } from "./askai-access";

describe("password attempt limiter", () => {
  it("allows the cap, then refuses until the hour resets", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < PASSWORD_ATTEMPTS_PER_HOUR; i++) expect(passwordAttemptAllowed("k1", t0)).toBe(true);
    expect(passwordAttemptAllowed("k1", t0)).toBe(false);
    expect(passwordAttemptAllowed("k1", t0 + 60 * 60 * 1000 + 1)).toBe(true);
  });
  it("treats a malformed cookie as no access", () => {
    const req = new Request("http://localhost/api/ask", { headers: { cookie: `${ASKAI_COOKIE}=%E0%A4%A` } });
    expect(requestHasAskaiAccess(req, env)).toBe(false);
  });
});
