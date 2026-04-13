import type { Metadata } from "next";
import { getAllOfficials } from "@/lib/data";
import {
  amountRangeToMidpoint,
  formatCompactCurrency,
} from "@/lib/format";
import type { AmountRange } from "@/lib/types";
import OfficialRankings from "../components/official-rankings";
import BuySellRatio from "../components/buy-sell-ratio";
import SectorTreemap from "../components/sector-treemap";

export const metadata: Metadata = {
  title: "Overview — Open Cabinet",
  description:
    "Aggregate analysis of executive branch financial transactions.",
};

function isSale(type: string): boolean {
  return type === "Sale" || type === "Sale (Partial)" || type === "Sale (Full)";
}

export default async function DashboardPage() {
  const officials = await getAllOfficials();

  const allTx = officials.flatMap((o) =>
    o.transactions.map((tx) => ({ ...tx, officialName: o.name, officialSlug: o.slug }))
  );

  const totalValue = allTx.reduce(
    (sum, tx) => sum + amountRangeToMidpoint(tx.amount as AmountRange),
    0
  );
  const salesValue = allTx
    .filter((tx) => isSale(tx.type))
    .reduce(
      (sum, tx) => sum + amountRangeToMidpoint(tx.amount as AmountRange),
      0
    );
  const purchasesValue = allTx
    .filter((tx) => tx.type === "Purchase")
    .reduce(
      (sum, tx) => sum + amountRangeToMidpoint(tx.amount as AmountRange),
      0
    );

  const salesCount = allTx.filter((tx) => isSale(tx.type)).length;
  const purchasesCount = allTx.filter((tx) => tx.type === "Purchase").length;
  const lateCount = allTx.filter((tx) => tx.lateFilingFlag).length;

  // Official rankings data
  const rankings = officials
    .map((o) => ({
      name: o.name,
      slug: o.slug,
      title: o.title,
      totalValue: o.transactions.reduce(
        (sum, tx) => sum + amountRangeToMidpoint(tx.amount as AmountRange),
        0
      ),
      tradeCount: o.transactions.length,
    }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 15);

  // Sector/category data for treemap
  const categories = new Map<string, number>();
  for (const tx of allTx) {
    const desc = tx.description.toLowerCase();
    let category: string;
    if (desc.includes("etf") || desc.includes("index fund") || desc.includes("vanguard") || desc.includes("ishares") || desc.includes("spdr")) {
      category = "ETFs & Index Funds";
    } else if (desc.includes("perp") || desc.includes("tier") || desc.includes("preferred") || desc.includes("pfd")) {
      category = "Preferred Securities";
    } else if (desc.includes("real estate") || desc.includes("llc") && (desc.includes("property") || desc.includes("land"))) {
      category = "Real Estate";
    } else if (desc.includes("bitcoin") || desc.includes("ethereum") || desc.includes("crypto") || desc.includes("solana") || desc.includes("polygon") || desc.includes("polkadot")) {
      category = "Cryptocurrency";
    } else if (desc.includes("bond") || desc.includes("treasury") || desc.includes("muni") || desc.includes("fixed income")) {
      category = "Bonds & Fixed Income";
    } else if (desc.includes("retirement") || desc.includes("401k") || desc.includes("ira")) {
      category = "Retirement Accounts";
    } else if (tx.ticker) {
      category = "Individual Stocks";
    } else {
      category = "Private & Other";
    }
    categories.set(
      category,
      (categories.get(category) || 0) + amountRangeToMidpoint(tx.amount as AmountRange)
    );
  }

  const treemapData = Array.from(categories.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <header className="mb-12">
        <h1 className="font-[family-name:var(--font-source-serif)] text-4xl text-neutral-900 mb-4">
          Overview
        </h1>
        <p className="text-neutral-500 max-w-xl leading-relaxed">
          Aggregate view of all executive branch financial transactions tracked
          by Open Cabinet.
        </p>
      </header>

      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-neutral-500 border-b border-neutral-200 pb-6 mb-12">
        <div>
          <span className="text-2xl font-semibold text-neutral-900 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1.5">
            {allTx.length}
          </span>
          transactions
        </div>
        <div>
          <span className="text-2xl font-semibold text-neutral-900 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1.5">
            ~{formatCompactCurrency(totalValue)}
          </span>
          est. total value
        </div>
        <div>
          <span className="text-2xl font-semibold text-amber-700 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1.5">
            {lateCount}
          </span>
          late filings
          <span className="text-neutral-400 ml-1">
            ({officials.find((o) => o.slug === "trump-donald-j")
              ? `${officials
                  .find((o) => o.slug === "trump-donald-j")!
                  .transactions.filter((t) => t.lateFilingFlag).length} from Trump`
              : ""})
          </span>
        </div>
      </div>

      <div className="space-y-16">
        <BuySellRatio
          salesCount={salesCount}
          purchasesCount={purchasesCount}
          salesValue={salesValue}
          purchasesValue={purchasesValue}
        />

        <SectorTreemap data={treemapData} />

        <OfficialRankings rankings={rankings} />
      </div>

      <p className="text-xs text-neutral-400 mt-12">
        Source: U.S. Office of Government Ethics. Estimated values use range
        midpoints. Categories assigned algorithmically based on asset
        descriptions.
      </p>
    </div>
  );
}
