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

/**
 * An official with a recently-posted filing who is NOT in this digest's items —
 * the "Also filed recently" teaser that lets single-official followers see what
 * they're missing without extra emails.
 */
export interface AlsoNewOfficial {
  name: string;
  slug: string;
  title?: string;
  agency?: string;
  /** New trades from the latest ingest, when known (> 0). */
  newTradeCount?: number;
  /** OGE posting date of the most recent filing (YYYY-MM-DD). */
  postedDate: string;
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
  /**
   * "Also filed recently" teaser: officials updated in the last 14 days who are
   * NOT in items. Derived purely from the data files (no wall clock), so it is
   * deterministic per build and freezes into the payload like everything else.
   * Empty when no referenceDate was supplied to selectDigestItems.
   */
  alsoNew: AlsoNewOfficial[];
  /** Count of current (non-former) tracked officials, for the follow-all CTA. */
  trackedOfficialCount: number;
}

const MAX_TRADES_SHOWN = 6;
const ALSO_NEW_MAX = 5;
const ALSO_NEW_WINDOW_DAYS = 14;

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
 * Pure "Also filed recently" selection, mirroring the home page's new-filings
 * banner (app/page.tsx): an official qualifies when our pipeline ingested their
 * data within the 14 days before `referenceDate` (lastIngestedDate — when WE
 * added it, not the OGE posting date, which can be weeks older on a backlog
 * ingest). `referenceDate` is the data files' index lastUpdated stamp, NOT the
 * wall clock, so the result is deterministic per build.
 *
 * Excludes officials already covered by this digest's items (excludeSlugs) and
 * prior-administration holdovers. Sorted by posting date newest first (slug
 * tiebreak for determinism), capped at 5.
 */
export function selectAlsoNew(
  officials: OfficialData[],
  opts: { excludeSlugs: Iterable<string>; referenceDate: string }
): AlsoNewOfficial[] {
  const exclude = new Set(opts.excludeSlugs);
  // Same cutoff arithmetic as the home banner: referenceDate minus 14 days.
  const refDate = new Date(opts.referenceDate + "T00:00:00");
  const cutoffStr = new Date(
    refDate.getTime() - ALSO_NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .split("T")[0];

  return officials
    .filter(
      (o) =>
        !o.formerOfficial &&
        !exclude.has(o.slug) &&
        Boolean(o.lastIngestedDate) &&
        (o.lastIngestedDate as string) >= cutoffStr
    )
    .map((o) => {
      const newCount = o.lastIngestedNewCount ?? 0;
      return {
        name: o.name,
        slug: o.slug,
        title: o.title,
        agency: o.agency,
        // Only assert a count we can substantiate (amended/restated ingests
        // clobber the delta to 0 — omit rather than claim "0 new trades").
        ...(newCount > 0 ? { newTradeCount: newCount } : {}),
        postedDate: o.mostRecentFilingDate,
      };
    })
    .sort(
      (a, b) =>
        b.postedDate.localeCompare(a.postedDate) || a.slug.localeCompare(b.slug)
    )
    .slice(0, ALSO_NEW_MAX);
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
 *
 * `referenceDate` (the data index's lastUpdated stamp) enables the alsoNew
 * teaser; when omitted alsoNew is empty. Never pass wall-clock time — the
 * result must be deterministic per build.
 */
export function selectDigestItems(
  officials: OfficialData[],
  opts: { notifiedUrls: Set<string>; referenceDate?: string }
): DigestResult {
  const { notifiedUrls, referenceDate } = opts;
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

  const slugs = items.map((i) => i.slug);

  return {
    // Emptiness is about displayable content: an all-amended day sends nothing
    // (and therefore ledgers nothing — we never emailed those filings).
    empty: items.length === 0,
    items,
    filingUrls: dedupedFilings.map((f) => f.url),
    filings: dedupedFilings,
    slugs,
    alsoNew: referenceDate
      ? selectAlsoNew(officials, { excludeSlugs: slugs, referenceDate })
      : [],
    // The follow-all CTA count. getAllOfficials already excludes former
    // officials, but re-filter here so the pure function is honest about it.
    trackedOfficialCount: officials.filter((o) => !o.formerOfficial).length,
  };
}

/**
 * A confirmed subscriber and the single official they follow.
 *
 * The follow signal is `officialSlug`:
 *   - null  → a "follow all" subscriber (signed up on the home page). They
 *             receive every digest.
 *   - slug  → a single-official follower (signed up on that official's page,
 *             where the form promised "Get <Name> filing alerts"). They receive
 *             a digest only when it covers the official they follow.
 *
 * The legacy `alert_type` (major/all) preference is retired from send routing —
 * the column is kept for backward compatibility but nothing reads it here.
 */
export interface FollowsRecipient {
  id: number;
  email: string;
  officialSlug: string | null;
}

/**
 * Pure follows filter (no DB) so the routing rule is unit-testable in isolation.
 *
 * A recipient is reached iff they follow ALL officials (officialSlug is null) or
 * they follow one of the officials present in THIS digest (officialSlug is in
 * digestSlugs). Non-mutating — returns a new array.
 */
export function filterRecipientsByFollows<
  T extends { officialSlug: string | null }
>(recipients: T[], digestSlugs: string[]): T[] {
  const inDigest = new Set(digestSlugs);
  return recipients.filter(
    (r) => r.officialSlug === null || inDigest.has(r.officialSlug)
  );
}

/**
 * Follows breakdown for the admin UI and the send receipt.
 *
 * - total        — every confirmed recipient considered.
 * - allFollowers — recipients following ALL officials (officialSlug null); they
 *                  are reached by every digest.
 * - reached      — how many recipients this specific digest reaches (=
 *                  filterRecipientsByFollows(...).length).
 * - excluded     — total - reached (followers of officials NOT in this digest).
 * - byOfficial   — per-slug follower counts among the recipients, keyed by the
 *                  slug they follow (only single-official followers appear here).
 */
export function followsBreakdown<
  T extends { officialSlug: string | null }
>(
  recipients: T[],
  digestSlugs: string[]
): {
  total: number;
  allFollowers: number;
  reached: number;
  excluded: number;
  byOfficial: Record<string, number>;
} {
  const total = recipients.length;
  let allFollowers = 0;
  const byOfficial: Record<string, number> = {};
  for (const r of recipients) {
    if (r.officialSlug === null) {
      allFollowers++;
    } else {
      byOfficial[r.officialSlug] = (byOfficial[r.officialSlug] ?? 0) + 1;
    }
  }
  const reached = filterRecipientsByFollows(recipients, digestSlugs).length;
  return { total, allFollowers, reached, excluded: total - reached, byOfficial };
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
  const { getAllOfficials, getOfficialsIndex } = await import("@/lib/data");
  const { db } = await import("@/lib/db");
  const { notifiedFilings } = await import("@/lib/schema");
  const { inArray } = await import("drizzle-orm");

  const [officials, index] = await Promise.all([
    getAllOfficials(),
    getOfficialsIndex(),
  ]);

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

  // referenceDate = the data files' own lastUpdated stamp (not wall clock), so
  // the alsoNew teaser is deterministic per build — same data, same digest.
  return selectDigestItems(officials, {
    notifiedUrls,
    referenceDate: index.lastUpdated,
  });
}
