/**
 * Public web versions of the subscriber digests.
 *
 * Every digest that goes out to subscribers becomes a page here. Nothing
 * separate triggers it: the send writes a `digest_runs` row with a frozen
 * payload, and these readers render from that row, so the archive shows what
 * was actually mailed rather than a re-derivation. A digest cannot be
 * reconstructed after the fact anyway — it is computed from un-notified
 * filings, and sending marks them notified.
 *
 * SAFETY: the frozen payload also holds the recipient list. Nothing in this
 * module may return it. `toPublicUpdate` picks fields explicitly for exactly
 * that reason — never spread the payload.
 */
import { desc, eq } from "drizzle-orm";
import type { AlsoNewOfficial, DigestItem } from "@/lib/digest";

export interface PublicUpdate {
  /** YYYY-MM-DD, and the URL slug. */
  date: string;
  runId: number;
  lede?: string;
  items: DigestItem[];
  alsoNew: AlsoNewOfficial[];
  trackedOfficialCount: number;
  /** Officials covered, for the index summary line. */
  officialCount: number;
  /** New trades announced across all officials in this digest. */
  tradeCount: number;
}

interface FrozenPayload {
  items?: DigestItem[];
  alsoNew?: AlsoNewOfficial[];
  trackedOfficialCount?: number;
  lede?: string;
  // recipients also lives here. Deliberately not read.
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toPublicUpdate(row: {
  id: number;
  sentAt: Date | null;
  createdAt: Date;
  frozenPayload: unknown;
}): PublicUpdate | null {
  const payload = (row.frozenPayload ?? {}) as FrozenPayload;
  const items = payload.items ?? [];
  if (items.length === 0) return null;

  return {
    date: isoDate(row.sentAt ?? row.createdAt),
    runId: row.id,
    lede: payload.lede,
    items,
    alsoNew: payload.alsoNew ?? [],
    trackedOfficialCount: payload.trackedOfficialCount ?? 0,
    officialCount: items.length,
    tradeCount: items.reduce((sum, i) => sum + i.newCount, 0),
  };
}

/** Every sent digest, newest first. */
export async function getPublicUpdates(): Promise<PublicUpdate[]> {
  const { db } = await import("@/lib/db");
  const { digestRuns } = await import("@/lib/schema");

  const rows = await db
    .select({
      id: digestRuns.id,
      sentAt: digestRuns.sentAt,
      createdAt: digestRuns.createdAt,
      frozenPayload: digestRuns.frozenPayload,
    })
    .from(digestRuns)
    .where(eq(digestRuns.status, "sent"))
    .orderBy(desc(digestRuns.sentAt));

  return rows.map(toPublicUpdate).filter((u): u is PublicUpdate => u !== null);
}

/**
 * One update by date. Two sends on the same day would collide on the slug;
 * the newer one wins the URL and both remain listed on the index, which is
 * the honest ordering when a day genuinely had two mailings.
 */
export async function getPublicUpdate(
  date: string
): Promise<PublicUpdate | null> {
  const all = await getPublicUpdates();
  return all.find((u) => u.date === date) ?? null;
}
