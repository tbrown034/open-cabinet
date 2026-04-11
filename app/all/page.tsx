import type { Metadata } from "next";
import { getAllOfficials } from "@/lib/data";
import { amountRangeToMidpoint } from "@/lib/format";
import type { AmountRange } from "@/lib/types";
import SwimLaneChart from "../components/swim-lane-chart";

export const metadata: Metadata = {
  title: "All Trades — Open Cabinet",
  description:
    "Every executive branch transaction on one canvas. 2,200+ trades across 29 officials.",
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

  const totalTx = ranked.reduce((sum, o) => sum + o.transactions.length, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <header className="mb-10">
        <h1 className="font-[family-name:var(--font-instrument-serif)] text-4xl text-neutral-900 mb-4">
          All Trades
        </h1>
        <p className="text-neutral-500 max-w-xl leading-relaxed">
          Every reported transaction across {ranked.length} executive branch
          officials. {totalTx.toLocaleString()} trades from January 2025 to the
          present. The density is the story.
        </p>
      </header>

      <SwimLaneChart officials={ranked} />

      <p className="text-xs text-neutral-400 mt-8">
        Source: U.S. Office of Government Ethics. Red = sale, green = purchase.
        Circle size = transaction amount range. Officials sorted by total
        estimated volume.
      </p>
    </div>
  );
}
