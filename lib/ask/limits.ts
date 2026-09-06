/**
 * Throttles and deadlines for the question box.
 *
 * Two limits with different jobs. The daily spending cap is durable, in the
 * ask_quota table, because an in-memory counter cannot bound spending across
 * serverless instances or restarts (Codex, Sept. 6). It lives in the route
 * beside the database call. What lives here is the per-IP hourly throttle,
 * which is a courtesy limit rather than a spending control and is not worth a
 * database round trip on every request, plus the in-memory daily counter that
 * only acts as a fallback where the ask_quota migration has not run yet.
 */

export const PER_IP_PER_HOUR = 30;
export const GLOBAL_PER_DAY = 300;
export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const IP_MAP_MAX_KEYS = 2000;
export const PHRASE_TIMEOUT_MS = 10_000;

const perIp = new Map<string, number[]>();
let globalHits: number[] = [];

/** Test seam. The limiter is module state, so a test has to clear it. */
export function resetAskLimiter(): void {
  perIp.clear();
  globalHits = [];
}

export function limiterSize(): number {
  return perIp.size;
}

export const LIMITER_LIMITS = { PER_IP_PER_HOUR, IP_MAP_MAX_KEYS };

/**
 * A rejected request is not recorded, so a caller who keeps hammering after a
 * 429 cannot keep growing the map (Codex, Sept. 6). Expired keys are swept
 * first; if the map is still at its cap, the oldest key is evicted, so
 * cardinality is bounded rather than merely trimmed.
 */
export function overIpLimit(key: string): boolean {
  const now = Date.now();
  const recent = (perIp.get(key) ?? []).filter((ts) => now - ts < HOUR_MS);
  if (recent.length >= PER_IP_PER_HOUR) {
    perIp.set(key, recent);
    return true;
  }
  recent.push(now);
  perIp.set(key, recent);

  if (perIp.size > IP_MAP_MAX_KEYS) {
    for (const [k, times] of perIp) {
      if (times.every((ts) => now - ts >= HOUR_MS)) perIp.delete(k);
    }
  }
  while (perIp.size > IP_MAP_MAX_KEYS) {
    const oldest = perIp.keys().next();
    if (oldest.done || oldest.value === key) break;
    perIp.delete(oldest.value);
  }
  return false;
}

/**
 * The per-instance daily fallback, used only when ask_quota is missing. It
 * cannot bound spending on its own; the durable reservation is the real cap.
 */
export function overGlobalLimit(): boolean {
  const now = Date.now();
  globalHits = globalHits.filter((ts) => now - ts < DAY_MS);
  if (globalHits.length >= GLOBAL_PER_DAY) return true;
  globalHits.push(now);
  return false;
}

/**
 * Run work under a deadline, but never let it take an answer down with it.
 *
 * By the time the phrasing call runs, the answer is computed and correct. A
 * phrasing call that throws used to surface as a 500, discarding work already
 * done (Codex, Sept. 6), and one that hangs would hold the request open.
 * Either way the caller gets null and falls back to the templated sentence.
 */
export async function withDeadline<T>(
  work: () => Promise<T>,
  ms: number
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } catch (error) {
    console.error("[ask] phrasing failed", error);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
