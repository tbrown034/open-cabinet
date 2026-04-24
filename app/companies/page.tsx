import type { Metadata } from "next";
import { getTradesByTicker } from "@/lib/data";
import { amountRangeToMidpoint } from "@/lib/format";
import CompanySearch from "../components/company-search";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Company Lookup — Open Cabinet",
  description:
    "Search which executive branch officials traded a specific stock or asset.",
};

export default async function CompaniesPage() {
  const tickerMap = await getTradesByTicker();

  const isSale = (type: string) =>
    type === "Sale" || type === "Sale (Partial)" || type === "Sale (Full)";

  const companies = Array.from(tickerMap.values())
    .map((c) => ({
      ticker: c.ticker,
      companyName: c.companyName,
      tradeCount: c.trades.length,
      buyCount: c.trades.filter((t) => t.type === "Purchase").length,
      sellCount: c.trades.filter((t) => isSale(t.type)).length,
      officialCount: new Set(c.trades.map((t) => t.officialSlug)).size,
      estimatedValue: c.trades.reduce(
        (sum, t) =>
          sum +
          amountRangeToMidpoint(
            t.amount as Parameters<typeof amountRangeToMidpoint>[0]
          ),
        0
      ),
    }))
    .sort((a, b) => b.tradeCount - a.tradeCount);

  // Top 5 most-traded by number of officials
  const featured = [...companies]
    .sort((a, b) => b.officialCount - a.officialCount)
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <header className="mb-10">
        <h1 className="font-[family-name:var(--font-source-serif)] text-4xl text-neutral-900 mb-4">
          Company Lookup
        </h1>
        <p className="text-neutral-500 max-w-xl leading-relaxed">
          Search by ticker or company name to see which executive branch
          officials traded that asset.
        </p>
      </header>

      <div className="mb-10">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-3">
          Most widely held
        </h2>
        <div className="flex flex-wrap gap-3">
          {featured.map((c) => (
            <Link
              key={c.ticker}
              href={`/companies/${c.ticker.toLowerCase()}`}
              className="border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 transition-colors"
            >
              <span className="font-[family-name:var(--font-dm-mono)] font-medium text-neutral-900">
                {c.ticker}
              </span>
              <span className="text-neutral-400 ml-2">
                {c.officialCount} officials
              </span>
            </Link>
          ))}
        </div>
      </div>

      <CompanySearch companies={companies} />

      <p className="text-xs text-neutral-400 mt-8">
        Source: U.S. Office of Government Ethics. Only assets with identified
        ticker symbols are searchable. {companies.length} companies tracked.
      </p>
    </div>
  );
}
