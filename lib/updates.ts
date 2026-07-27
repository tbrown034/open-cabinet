/**
 * The public filing log at /filings.
 *
 * Each entry is a committed JSON file under data/filings-log/, written by
 * scripts/publish-filing-log.ts. Publishing is deliberately separate from
 * mailing: the web version can go up the moment a batch is parsed, while the
 * email waits for a sensible hour. One entry per date, and the file is the
 * only source of truth.
 *
 * Files rather than the digest_runs table, for three reasons. The pages
 * render statically, so the log costs no database call. The entry survives
 * independently of send state, which is what lets it publish first. And a
 * file built from public disclosure data cannot carry a subscriber address
 * the way the send's frozen payload does.
 */
import { readdir, readFile } from "fs/promises";
import path from "path";
import type { AlsoNewOfficial, DigestItem } from "@/lib/digest";

export interface PublicUpdate {
  /** YYYY-MM-DD, and the URL slug. */
  date: string;
  lede?: string;
  items: DigestItem[];
  alsoNew: AlsoNewOfficial[];
  trackedOfficialCount: number;
  /** Officials covered, for the index summary line. */
  officialCount: number;
  /** New trades announced across all officials in this entry. */
  tradeCount: number;
}

interface FilingLogFile {
  date: string;
  lede?: string;
  items: DigestItem[];
  alsoNew?: AlsoNewOfficial[];
  trackedOfficialCount?: number;
}

export const FILING_LOG_DIR = path.join(process.cwd(), "data", "filings-log");

function toPublicUpdate(file: FilingLogFile): PublicUpdate | null {
  const items = file.items ?? [];
  if (items.length === 0) return null;
  return {
    date: file.date,
    lede: file.lede,
    items,
    alsoNew: file.alsoNew ?? [],
    trackedOfficialCount: file.trackedOfficialCount ?? 0,
    officialCount: items.length,
    tradeCount: items.reduce((sum, i) => sum + i.newCount, 0),
  };
}

/** Every published entry, newest first. */
export async function getPublicUpdates(): Promise<PublicUpdate[]> {
  let names: string[];
  try {
    names = await readdir(FILING_LOG_DIR);
  } catch {
    return []; // no log yet
  }

  const entries: PublicUpdate[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await readFile(path.join(FILING_LOG_DIR, name), "utf-8");
      const parsed = toPublicUpdate(JSON.parse(raw) as FilingLogFile);
      if (parsed) entries.push(parsed);
    } catch {
      // A malformed entry must not take down the whole log.
      continue;
    }
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * The scope a subscriber send should use, derived from the log.
 *
 * The web version is published first, then the email goes out during
 * daylight hours. Both must describe the same filings, and the way to
 * guarantee that is to derive one from the other rather than trusting two
 * hand-set values to agree — they already diverged once, when the admin
 * panel would have mailed the full 2,613-trade backlog while /filings
 * showed 93 trades.
 *
 * Returns the newest published entry's date, to be passed as
 * `ingestedOnOrAfter`. Null when nothing is published, which leaves the
 * send unscoped exactly as before.
 */
export async function getSendScope(): Promise<string | null> {
  const updates = await getPublicUpdates();
  return updates[0]?.date ?? null;
}

/** One entry by date, or null. */
export async function getPublicUpdate(
  date: string
): Promise<PublicUpdate | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  try {
    const raw = await readFile(
      path.join(FILING_LOG_DIR, `${date}.json`),
      "utf-8"
    );
    return toPublicUpdate(JSON.parse(raw) as FilingLogFile);
  } catch {
    return null;
  }
}
