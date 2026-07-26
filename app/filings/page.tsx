import Link from "next/link";
import type { Metadata } from "next";
import { formatDate } from "@/lib/format";
import { getPublicUpdates } from "@/lib/updates";

export const metadata: Metadata = {
  title: "New Executive Branch Stock Filings, Logged as They Post",
  description:
    "A dated log of every new financial disclosure Open Cabinet has picked up from the U.S. Office of Government Ethics — who filed, what they traded and when.",
};

// Each send adds a row, so the log must not be baked at build time.
export const revalidate = 300;

export default async function FilingsIndexPage() {
  const updates = await getPublicUpdates();

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-[family-name:var(--font-source-serif)] text-4xl md:text-5xl text-neutral-900 mb-4 leading-tight">
        New filings
      </h1>
      <p className="text-neutral-500 leading-relaxed max-w-xl">
        Every time Open Cabinet picks up new disclosures from the Office of
        Government Ethics, subscribers get an email and it is logged here. This
        is the web version of that email, in full.
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
            <li key={u.runId} className="border-b border-neutral-200">
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
                  {u.items.map((i) => i.name.split(",")[0]).join(", ")}
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
