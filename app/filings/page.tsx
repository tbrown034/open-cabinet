import Link from "next/link";
import type { Metadata } from "next";
import { displayName, formatDate } from "@/lib/format";
import { getPublicUpdates } from "@/lib/updates";

export const metadata: Metadata = {
  title: "New Executive Branch Stock Filings, Logged as They Post",
  description:
    "A dated log of every new financial disclosure Open Cabinet has picked up from the U.S. Office of Government Ethics — who filed, what they traded and when.",
};

// Entries are committed files, so the log renders statically.
export default async function FilingsIndexPage() {
  const updates = await getPublicUpdates();

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-[family-name:var(--font-source-serif)] text-4xl md:text-5xl text-neutral-900 mb-4 leading-tight">
        New filings
      </h1>
      <p className="text-neutral-500 leading-relaxed max-w-xl">
        Every batch of new disclosures Open Cabinet picks up from the Office of
        Government Ethics is logged here in full, and goes out to subscribers
        by email.
      </p>

      {updates.length === 0 ? (
        <div className="mt-10 border border-neutral-200 bg-stone-50 px-4 py-8 text-sm text-neutral-500">
          No filings logged yet. The first entry appears the next time a batch
          of disclosures goes out.{" "}
          <Link href="/#alerts" className="underline hover:text-neutral-900">
            Get them by email
          </Link>
          .
        </div>
      ) : (
        <ul className="mt-10 border-t border-neutral-900">
          {updates.map((u) => (
            <li key={u.date} className="border-b border-neutral-200">
              <Link
                href={`/filings/${u.date}`}
                className="block py-5 group hover:bg-neutral-50 transition-colors"
              >
                <div className="text-xs uppercase tracking-wider text-neutral-500">
                  {formatDate(u.date)}
                </div>
                <div className="font-[family-name:var(--font-source-serif)] text-xl text-neutral-900 mt-1 group-hover:underline">
                  {u.officialCount} official{u.officialCount === 1 ? "" : "s"},{" "}
                  {u.tradeCount.toLocaleString()} new trade
                  {u.tradeCount === 1 ? "" : "s"}
                </div>
                <div className="text-sm text-neutral-500 mt-1">
                  {u.items.map((i) => displayName(i.name)).join(", ")}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-neutral-400 mt-10">
        Source: U.S. Office of Government Ethics. Amounts are reported in
        ranges, as federal law requires.
      </p>
    </div>
  );
}
