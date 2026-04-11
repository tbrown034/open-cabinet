import type { Metadata } from "next";
import { getTradesByTicker } from "@/lib/data";
import { amountRangeToMidpoint, formatCompactCurrency } from "@/lib/format";
import CompanySearch from "../components/company-search";

export const metadata: Metadata = {
  title: "Company Lookup — Open Cabinet",
  description:
    "Search which executive branch officials traded a specific stock or asset.",
};

export default async function CompaniesPage() {
  const tickerMap = await getTradesByTicker();

  const companies = Array.from(tickerMap.values())
    .map((c) => ({
      ticker: c.ticker,
      companyName: c.companyName,
      tradeCount: c.trades.length,
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <header className="mb-12">
        <h1 className="font-[family-name:var(--font-instrument-serif)] text-4xl text-neutral-900 mb-4">
          Company Lookup
        </h1>
        <p className="text-neutral-500 max-w-xl leading-relaxed">
          Search by ticker or company name to see which executive branch
          officials traded that asset.
        </p>
      </header>

      <CompanySearch companies={companies} />

      <p className="text-xs text-neutral-400 mt-8">
        Source: U.S. Office of Government Ethics. Only assets with identified
        ticker symbols are searchable.
      </p>
    </div>
  );
}
