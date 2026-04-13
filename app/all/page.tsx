import type { Metadata } from "next";
import { getAllOfficials } from "@/lib/data";
import { amountRangeToMidpoint, formatCompactCurrency } from "@/lib/format";
import type { AmountRange } from "@/lib/types";
import SwimLaneChart from "../components/swim-lane-chart";

export const metadata: Metadata = {
  title: "All Executive Branch Trades — Open Cabinet",
  description:
    "Every executive branch transaction on one canvas. 3,200+ trades across 34 officials.",
  openGraph: {
    title: "All Executive Branch Trades — Open Cabinet",
    description: "Every reported transaction across 34 officials on one D3 visualization.",
    type: "website",
  },
};

function isSale(type: string): boolean {
  return type === "Sale" || type === "Sale (Partial)" || type === "Sale (Full)";
}

export default async function AllTradesPage() {
  const officials = await getAllOfficials();

  // Sort officials by total transaction volume (most active at top)
  const ranked = officials
    .map((o) => ({
      name: o.name,
      slug: o.slug,
      title: o.title,
      agency: o.agency,
      level: o.level,
      totalValue: o.transactions.reduce(
        (sum, tx) => sum + amountRangeToMidpoint(tx.amount as AmountRange),
        0
      ),
      transactions: o.transactions.map((tx) => ({
        description: tx.description,
        ticker: tx.ticker,
        type: tx.type as string,
        date: tx.date,
        amount: tx.amount as string,
        lateFilingFlag: tx.lateFilingFlag,
        isSale: isSale(tx.type),
      })),
    }))
    .sort((a, b) => b.totalValue - a.totalValue);

  const allTx = ranked.flatMap((o) => o.transactions);
  const totalTx = allTx.length;
  const salesCount = allTx.filter((tx) => tx.isSale).length;
  const purchasesCount = allTx.filter((tx) => tx.type === "Purchase").length;
  const lateCount = allTx.filter((tx) => tx.lateFilingFlag).length;
  const salesValue = allTx
    .filter((tx) => tx.isSale)
    .reduce((sum, tx) => sum + amountRangeToMidpoint(tx.amount as any), 0);
  const purchasesValue = allTx
    .filter((tx) => tx.type === "Purchase")
    .reduce((sum, tx) => sum + amountRangeToMidpoint(tx.amount as any), 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <header className="mb-10">
        <h1 className="font-[family-name:var(--font-source-serif)] text-4xl text-neutral-900 mb-4">
          All Trades
        </h1>
        <p className="text-neutral-500 max-w-xl leading-relaxed">
          Every reported transaction across {ranked.length} executive branch
          officials. {totalTx.toLocaleString()} trades from January 2025 to the
          present. The density is the story.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-500 mt-4">
          <span>
            <span className="text-red-700 font-semibold">{salesCount}</span>{" "}
            sales (est. {formatCompactCurrency(salesValue)})
          </span>
          <span>
            <span className="text-emerald-700 font-semibold">{purchasesCount}</span>{" "}
            purchases (est. {formatCompactCurrency(purchasesValue)})
          </span>
          <span>
            <span className="text-amber-700 font-semibold">{lateCount}</span>{" "}
            late filings
          </span>
        </div>
      </header>

      <SwimLaneChart officials={ranked} />

      <p className="text-xs text-neutral-400 mt-8">
        Source: U.S. Office of Government Ethics. Red = sale, green = purchase.
        Circle size = transaction amount range. Dollar values are estimates
        based on range midpoints.{" "}
        <a href="/about#known-limitations" className="underline hover:text-neutral-600">
          Learn more
        </a>
        .
      </p>
    </div>
  );
}
