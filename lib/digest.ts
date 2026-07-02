/**
 * Assembles the filing-alert digest.
 *
 * Source of truth is the parsed JSON (lib/data.ts), NOT the cron's URL diff and
 * NOT per-trade DB pdfSource (which `seed` wipes). We pick officials that have
 * un-notified source filings, take those filing URLs as the dedupe key, and drop
 * any filing already sent (the notifiedFilings ledger).
 *
 * Inclusion is gated on un-notified source FILINGS, not on lastIngestedNewCount.
 * That count is only the delta of the latest ingest run (a display hint that the
 * runtime cannot reset, since data/ is read-only on Vercel) — gating on it lost
 * filings whenever a later same-official ingest clobbered the delta to 0 (e.g. an
 * amended report that restated already-known trades). The per-URL ledger is the
 * authoritative, lossless dedupe.
 *
 * selectDigestItems is a pure function (easy to unit-test). buildDigest wires it
 * to the real data + DB.
 *
 * LAUNCH NOTE: notifiedFilings must be seeded with every currently-known filing
 * URL at go-live (scripts/backfill-notified.ts, built separately), otherwise the
 * first digest would include the entire historical backlog. After that seed, only
 * genuinely new filings appear.
 */
import { createHash } from "crypto";
import type { OfficialData, Transaction } from "@/lib/types";

export interface DigestTrade {
  description: string;
  ticker: string | null;
  type: string;
  amount: string;
  date: string;
  lateFilingFlag: boolean;
}

export interface DigestItem {
  slug: string;
  name: string;
  title: string;
  agency: string;
  newCount: number;
  /** Newest un-notified source filing URL — the primary link + dedupe key. */
  primaryFilingUrl: string;
  /** All un-notified source filing URLs for this official (for the ledger). */
  filingUrls: string[];
  /** A few most-recent trades to preview (proxy for "the new ones"). */
  trades: DigestTrade[];
}

export interface DigestResult {
  empty: boolean;
  items: DigestItem[];
  /** Every un-notified filing URL a send will cover — flat list, backward-compat. */
  filingUrls: string[];
  /**
   * Same coverage as filingUrls, but carrying the owning official's slug so the
   * notifiedFilings ledger write has the notNull officialSlug it requires.
   * Includes amended-only officials (no display card) so a send clears them too.
   */
  filings: { url: string; slug: string }[];
  /** Slugs of officials that produced a display card. */
  slugs: string[];
}

const MAX_TRADES_SHOWN = 6;

function toTrade(t: Transaction): DigestTrade {
  return {
    description: t.description,
    ticker: t.ticker,
    type: t.type,
    amount: t.amount,
    date: t.date,
    lateFilingFlag: t.lateFilingFlag,
  };
}

/**
 * Pure selection: given loaded officials and the set of already-notified filing
 * URLs, return the digest items plus every un-notified filing to ledger.
 *
 * Dedup is by filing URL via notifiedFilings ONLY — deliberately no date-window
 * pre-filter. A date window at day granularity drops filings ingested the same
 * day a digest was sent, and they'd never reappear; the per-URL ledger is the
 * correct, lossless source of truth.
 *
 * Transactions carry no link back to their source filing, so we cannot say WHICH
 * trades belong to a newly-appeared filing. When the latest ingest recorded a
 * positive delta (lastIngestedNewCount > 0) we preview that many recent trades as
 * an honest proxy and render a card. When the delta is <= 0 (a restated/amended
 * filing, or a delta clobbered by a later same-official ingest) we still surface
 * the filing URLs so a confirmed send clears the ledger, but render no card —
 * rather than assert a "new trade" count we cannot substantiate.
 */
export function selectDigestItems(
  officials: OfficialData[],
  opts: { notifiedUrls: Set<string> }
): DigestResult {
  const { notifiedUrls } = opts;
  const items: DigestItem[] = [];
  const filings: { url: string; slug: string }[] = [];

  for (const o of officials) {
    // Un-notified source filings, newest first.
    const newFilings = (o.sourceFilings ?? [])
      .filter((f): f is { date: string; url: string; label: string } =>
        Boolean(f.url) && !notifiedUrls.has(f.url as string)
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    if (newFilings.length === 0) continue;

    const urls = newFilings.map((f) => f.url);
    // Every un-notified filing is ledgered on a confirmed send, whether or not
    // it produced a display card, so it never re-surfaces.
    for (const url of urls) filings.push({ url, slug: o.slug });

    // Hoisted above the display guard so the (formerly unreachable) trade-count
    // fallbacks are gone: newCount is resolved exactly once here.
    const newCount = o.lastIngestedNewCount ?? 0;
    if (newCount <= 0) continue; // ledger-only; no card (see JSDoc)

    const trades = [...o.transactions]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, Math.min(newCount, MAX_TRADES_SHOWN))
      .map(toTrade);

    items.push({
      slug: o.slug,
      name: o.name,
      title: o.title,
      agency: o.agency,
      newCount,
      primaryFilingUrl: newFilings[0].url,
      filingUrls: urls,
      trades,
    });
  }

  // Stable ordering (most trades first) so a re-rendered digest is deterministic.
  items.sort((a, b) => b.newCount - a.newCount || a.slug.localeCompare(b.slug));

  // Dedupe the flat URL list (URLs are unique per filing, but guard anyway).
  const seen = new Set<string>();
  const dedupedFilings = filings.filter((f) =>
    seen.has(f.url) ? false : (seen.add(f.url), true)
  );

  return {
    // Emptiness is about displayable content: an all-amended day sends nothing
    // (and therefore ledgers nothing — we never emailed those filings).
    empty: items.length === 0,
    items,
    filingUrls: dedupedFilings.map((f) => f.url),
    filings: dedupedFilings,
    slugs: items.map((i) => i.slug),
  };
}

/**
 * Deterministic idempotency key for a digest send: sha256 over the sorted,
 * de-duplicated set of filing URLs. Same filing set -> same key, regardless of
 * order, so a retry maps to the same digest_runs row (which carries the frozen
 * payload) instead of starting a second send.
 */
export function digestIdempotencyKey(filingUrls: string[]): string {
  const sorted = [...new Set(filingUrls)].sort();
  return createHash("sha256").update(sorted.join("\n")).digest("hex");
}

/** Deterministic per-chunk idempotency key: stable across retries by design. */
export function chunkKey(sendKey: string, n: number): string {
  return `${sendKey}-c${n}`;
}

/**
 * Wire the pure selector to real data + DB state. Loads parsed officials and the
 * notifiedFilings ledger (queried only for the URLs we might announce, so it
 * stays cheap as the ledger history grows).
 */
export async function buildDigest(): Promise<DigestResult> {
  const { getAllOfficials } = await import("@/lib/data");
  const { db } = await import("@/lib/db");
  const { notifiedFilings } = await import("@/lib/schema");
  const { inArray } = await import("drizzle-orm");

  const officials = await getAllOfficials();

  // Candidate URLs = every source-filing URL we might announce. We ask the ledger
  // about THESE only (WHERE filing_url IN (...)) rather than scanning the whole
  // notified_filings table, which grows without bound over time.
  const candidateUrls = [
    ...new Set(
      officials.flatMap((o) =>
        (o.sourceFilings ?? [])
          .map((f) => f.url)
          .filter((u): u is string => Boolean(u))
      )
    ),
  ];

  const notifiedRows = candidateUrls.length
    ? await db
        .select({ url: notifiedFilings.filingUrl })
        .from(notifiedFilings)
        .where(inArray(notifiedFilings.filingUrl, candidateUrls))
    : [];
  const notifiedUrls = new Set(notifiedRows.map((r) => r.url));

  return selectDigestItems(officials, { notifiedUrls });
}
