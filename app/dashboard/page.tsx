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
  title: "Overview",
  description:
    "Aggregate analysis of executive branch financial transactions.",
};

function isSale(type: string): boolean {
  return type === "Sale" || type === "Sale (Partial)" || type === "Sale (Full)";
}

// Asset class is inferred from each filing's free-text description (OGE does
// not provide a structured asset type). Order matters: the first pattern that
// matches wins, so the most specific tests run first. Bonds and untickered
// equities used to fall into a single catch-all that swallowed ~64% of volume;
// these patterns pull them out so the treemap reflects the real asset mix.
function classifyAsset(description: string, hasTicker: boolean): string {
  const d = description.toLowerCase();

  if (/\b(?:bitcoin|ethereum|crypto|solana|polygon|polkadot)\b/.test(d))
    return "Cryptocurrency";

  // Municipal, revenue and corporate bonds. Beyond the literal word "bond",
  // catch the coupon + maturity signature ("5.00% Due Oct 1, 2049") and the
  // muni markers (REV, G.O., GAS DIST, SCH DIST, bond anticipation notes).
  if (
    /\b(?:treasury|muni|municipal|fixed income)\b/.test(d) ||
    /\bbond\b/.test(d) ||
    /\bdue\b\s*(?:\w+\s+)?\d/.test(d) ||
    /\d(?:\.\d+)?\s*%.*due/.test(d) ||
    /\b(?:rev|g\.?o\.?|gas dist|gas sply|gen oblig|sch dist|anticipation)\b/.test(d)
  )
    return "Bonds & Fixed Income";

  if (/\b(?:perp|tier|preferred|pfd)\b/.test(d)) return "Preferred Securities";

  if (/\b(?:etf|index fund|vanguard|ishares|spdr)\b/.test(d))
    return "ETFs & Index Funds";

  if (
    /\b(?:pimco|franklin|invesco|brandywine|allspring|blackrock|fidelity|schwab|dodge & cox|nuveen)\b/.test(d) ||
    /\btax[- ]free\b/.test(d) ||
    /\b(?:income|municipal|tax|bond|mutual)\s+fund\b/.test(d) ||
    /\bfund\b.*\bclass [abc]\b/.test(d)
  )
    return "Mutual Funds";

  if (
    /\breal estate\b/.test(d) ||
    /\bmarina\b/.test(d) ||
    /\bllc\b(?=.*\b(?:property|land)\b)/.test(d)
  )
    return "Real Estate";

  if (/\b(?:retirement|401k|ira)\b/.test(d)) return "Retirement Accounts";

  // Hedge funds, LPs and LLCs (Key Square, Cantor Fitzgerald, MSD, and the like).
  if (
    /\b(?:l\.?p\.?|llc|llp|partners|capital|ventures|associates|master fund)\b/.test(d) ||
    /\bfund\b/.test(d)
  )
    return "Private Funds & Partnerships";

  // Individual equities: a captured ticker, a corporate form, or a broker-style
  // "COM" / "UNSOLICITED" / share-class suffix.
  if (
    hasTicker ||
    /\b(?:inc|corp|plc|n\.?v\.?|ltd|companies|company)\b/.test(d) ||
    /\bcom\b/.test(d) ||
    /\bunsolicited\b/.test(d) ||
    /\bclass [abc]\b/.test(d) ||
    /\b(?:bancshares|bancorp|labs|technologies)\b/.test(d)
  )
    return "Individual Stocks";

  // Named holdings whose filing lists no ticker or fund identifier and can't be
  // classified from the description alone (e.g. a large untickered Fiserv position).
  return "Other";
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

  // Sector/category data for treemap. Categories are inferred from each
  // filing's free-text asset description (see classifyAsset above).
  const categories = new Map<string, number>();
  for (const tx of allTx) {
    const category = classifyAsset(tx.description, Boolean(tx.ticker));
    categories.set(
      category,
      (categories.get(category) || 0) +
        amountRangeToMidpoint(tx.amount as AmountRange)
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
          note="Asset classes are inferred from each filing's free-text description; OGE does not report a structured asset type. 'Other' is mostly named holdings whose filings list no ticker or fund identifier — led by a large untickered Fiserv position."
        />

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
