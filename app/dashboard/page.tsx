import type { Metadata } from "next";
import Link from "next/link";
import { getAllOfficials, getTradesByTicker } from "@/lib/data";
import { readAssetResolution } from "@/lib/asset-resolution";
import { recordIdsFor } from "@/lib/row-verification";
import { INSTRUMENT_LABEL, type InstrumentType } from "@/lib/instrument-type";
import {
  formatCompactCurrency, rowsForTotals, sumAmountEstimates, transactionEstimate } from "@/lib/format";
import OfficialRankings from "../components/official-rankings";
import BuySellRatio from "../components/buy-sell-ratio";
import SectorTreemap from "../components/sector-treemap";

export const metadata: Metadata = {
  alternates: { canonical: "/dashboard" },
  title: "Overview",
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

  const totalValue = sumAmountEstimates(allTx).estimate;
  const salesValue = sumAmountEstimates(allTx.filter((tx) => isSale(tx.type))).estimate;
  const purchasesValue = sumAmountEstimates(
    allTx.filter((tx) => tx.type === "Purchase")
  ).estimate;

  const salesCount = allTx.filter((tx) => isSale(tx.type)).length;
  const purchasesCount = allTx.filter((tx) => tx.type === "Purchase").length;
  const lateCount = allTx.filter((tx) => tx.lateFilingFlag).length;

  // Official rankings data
  const rankings = officials
    .map((o) => ({
      name: o.name,
      slug: o.slug,
      title: o.title,
      formerOfficial: Boolean(o.formerOfficial || o.departedDate),
      totalValue: sumAmountEstimates(o.transactions).estimate,
      tradeCount: o.transactions.length,
    }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 15);

  // Treemap by instrument type from the asset lane (data/meta/asset-
  // resolution.json), the same typing the trade tables and the methodology
  // page use. Until Sep 7, 2026 this page had its own regex classifier
  // that disagreed with the lane (it called resolved Fiserv rows "Other").
  const assetFile = readAssetResolution();
  const byType = new Map<InstrumentType, number>();
  for (const o of officials) {
    const ids = recordIdsFor(o.transactions);
    o.transactions.forEach((tx, i) => {
      const type = assetFile?.rows[ids[i]]?.instrumentType ?? "unknown";
      byType.set(type, (byType.get(type) ?? 0) + (transactionEstimate(tx) ?? 0));
    });
  }
  const treemapData = Array.from(byType.entries())
    .map(([type, value]) => ({ name: INSTRUMENT_LABEL[type], value }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  // Most traded companies: the company pages' own groups, ranked by how
  // many officials traded the symbol, then by trades. Only rows the lane
  // tied to a company on exact evidence count (see getTradesByTicker).
  const tickerMap = await getTradesByTicker();
  const topCompanies = Array.from(tickerMap.values())
    .map((c) => {
      const trades = rowsForTotals(c.trades, c.trades.map((t) => t.verification));
      return {
        ticker: c.ticker,
        companyName: c.companyName,
        officials: new Set(trades.map((t) => t.officialSlug)).size,
        trades: trades.length,
        buys: trades.filter((t) => t.type === "Purchase").length,
        sells: trades.filter((t) => isSale(t.type)).length,
      };
    })
    .sort((a, b) => b.officials - a.officials || b.trades - a.trades)
    .slice(0, 10);

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
            {allTx.length.toLocaleString()}
          </span>
          transactions
        </div>
        <div>
          <span className="text-2xl font-semibold text-neutral-900 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1.5">
            ~{formatCompactCurrency(totalValue)}
          </span>
          trade volume (est.)
        </div>
        <div>
          <span className="text-2xl font-semibold text-amber-700 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1.5">
            {lateCount.toLocaleString()}
          </span>
          late-filed transactions
          <span className="text-neutral-400 ml-1">
            ({officials.find((o) => o.slug === "trump-donald-j")
              ? `${officials
                  .find((o) => o.slug === "trump-donald-j")!
                  .transactions.filter((t) => t.lateFilingFlag).length.toLocaleString()} from Trump`
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

        <SectorTreemap
          data={treemapData}
          note="Instrument type is read from each filing's printed description by the same rules the trade tables use; OGE does not report a structured asset type. Bonds and notes are typed from the coupon and maturity the broker prints."
        />

        <section>
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-4">
            Most traded companies
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-900 text-xs uppercase tracking-wider text-neutral-500">
                  <th className="pb-2 pr-4 font-medium">Ticker</th>
                  <th className="pb-2 pr-4 font-medium">Company</th>
                  <th className="pb-2 pr-4 font-medium text-right">Officials</th>
                  <th className="pb-2 pr-4 font-medium text-right">Trades</th>
                  <th className="pb-2 pr-4 font-medium text-right">Sells</th>
                  <th className="pb-2 font-medium text-right">Buys</th>
                </tr>
              </thead>
              <tbody>
                {topCompanies.map((c, i) => (
                  <tr key={c.ticker} className={`border-b border-neutral-100 ${i % 2 === 1 ? "bg-neutral-50/50" : ""}`}>
                    <td className="py-2 pr-4 font-[family-name:var(--font-dm-mono)]">
                      <Link href={`/companies/${c.ticker.toLowerCase()}`} className="hover:underline">{c.ticker}</Link>
                    </td>
                    <td className="py-2 pr-4">
                      <Link href={`/companies/${c.ticker.toLowerCase()}`} className="text-neutral-900 hover:underline">{c.companyName}</Link>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{c.officials}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{c.trades}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-red-700">{c.sells}</td>
                    <td className="py-2 text-right tabular-nums text-emerald-700">{c.buys}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-500 mt-3">
            Ranked by how many officials traded the company. Only trades tied to a listed company on exact evidence count; see{" "}
            <Link href="/companies" className="underline hover:text-neutral-900">all {tickerMap.size.toLocaleString()} companies</Link>{" "}
            or <Link href="/methodology#assets" className="underline hover:text-neutral-900">how names become tickers</Link>.
          </p>
        </section>

        <OfficialRankings rankings={rankings} />
      </div>

      <p className="text-xs text-neutral-400 mt-12">
        Source: U.S. Office of Government Ethics. Estimated values use range
        midpoints. Instrument types come from the printed description; company
        ties from exact matches against exchange and SEC lists or a person&rsquo;s
        decision.
      </p>
    </div>
  );
}
