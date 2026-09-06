/**
 * Who may call the question box, and who is calling.
 *
 * The shared check in lib/origin-check.ts allows any *.vercel.app host so
 * previews stay testable. For a paid endpoint that means any Vercel tenant can
 * spend this project's model budget (Codex, Sept. 6), so the ask route keeps
 * its own list: the production hosts, whatever ALLOWED_ORIGINS names, and
 * localhost only outside production.
 */
import { createHash } from "crypto";

export function allowedAskHosts(
  env: NodeJS.ProcessEnv = process.env
): Set<string> {
  const hosts = ["open-cabinet.org", "www.open-cabinet.org"];
  for (const entry of (env.ALLOWED_ORIGINS ?? "").split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    try {
      hosts.push(new URL(trimmed).hostname);
    } catch {
      hosts.push(trimmed);
    }
  }
  if (env.NODE_ENV !== "production") hosts.push("localhost", "127.0.0.1");
  return new Set(hosts);
}

export function isAskOrigin(
  request: Request,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return allowedAskHosts(env).has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

/**
 * Client identity for the per-IP quota.
 *
 * TRUST ASSUMPTION: this is only sound behind an ingress that writes these
 * headers itself. x-vercel-forwarded-for is set by Vercel's edge and cannot be
 * forged by a caller, so it is preferred. x-forwarded-for can be set by
 * anyone, and a caller who rotates it walks straight past the per-IP limit
 * (Codex, Sept. 6), so the LAST hop is taken rather than the first: the last
 * entry is the one the nearest proxy appended, while everything to its left is
 * whatever the client claimed. Run behind a proxy that appends, or this limit
 * is advisory. The durable daily cap is the control that does not depend on
 * client identity.
 */
export function clientIp(request: Request): string {
  const platform = request.headers.get("x-vercel-forwarded-for");
  if (platform) return lastHop(platform);
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return lastHop(forwarded);
  return "unknown";
}

export function lastHop(header: string): string {
  const hops = header.split(",").map((h) => h.trim()).filter(Boolean);
  return hops[hops.length - 1] ?? "unknown";
}
