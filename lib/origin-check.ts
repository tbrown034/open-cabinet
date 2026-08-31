/**
 * Same-site Origin check for public mutation endpoints.
 *
 * Browsers attach an Origin header to every POST they submit, and a request
 * from our own pages always carries our own host. Scripted bots that POST
 * the JSON API directly (the qq.com signup wave) either omit the header or
 * send someone else's — they never render the form, so the honeypot cannot
 * catch them and this check is the line that does.
 *
 * Deliberately a screen door, not a vault: a targeted attacker can forge the
 * header. The traffic this stops is untargeted spray, where forging per-site
 * isn't worth the bot's effort.
 */

const ALLOWED_HOSTS = new Set([
  "open-cabinet.org",
  "www.open-cabinet.org",
  "localhost",
  "127.0.0.1",
]);

export function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname;
    if (ALLOWED_HOSTS.has(host)) return true;
    // Vercel preview deployments keep their own hostname; allow them so the
    // form stays testable pre-merge. Previews sit behind team auth anyway.
    return host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}
