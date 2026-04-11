import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTradesByTicker, getAllTickers } from "@/lib/data";
import { formatDate, amountRangeLabel, amountRangeToMidpoint, formatCompactCurrency } from "@/lib/format";
import type { AmountRange } from "@/lib/types";
import CompanyBarChart from "@/app/components/company-bar-chart";

export async function generateStaticParams() {
  const tickers = await getAllTickers();
  return tickers.map((ticker) => ({ ticker: ticker.toLowerCase() }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  const tickerMap = await getTradesByTicker();
  const company = tickerMap.get(ticker.toUpperCase());
  if (!company) return { title: "Not Found — Open Cabinet" };
  const officialCount = new Set(company.trades.map((t) => t.officialSlug)).size;
  return {
    title: `${company.ticker} — Who in Government Trades This Stock — Open Cabinet`,
    description: `${officialCount} executive branch official${officialCount !== 1 ? "s" : ""} reported ${company.trades.length} trade${company.trades.length !== 1 ? "s" : ""} in ${company.companyName}.`,
    openGraph: {
      title: `${company.ticker} — Who in Government Trades This Stock`,
      description: `${officialCount} official${officialCount !== 1 ? "s" : ""}, ${company.trades.length} trade${company.trades.length !== 1 ? "s" : ""} in ${company.companyName}.`,
      type: "website",
    },
  };
}

function isSale(type: string): boolean {
  return type === "Sale" || type === "Sale (Partial)" || type === "Sale (Full)";
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const tickerMap = await getTradesByTicker();
  const company = tickerMap.get(ticker.toUpperCase());

  if (!company) {
    notFound();
  }

  const { trades } = company;
  const sorted = [...trades].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const officialGroups = new Map<
    string,
    { name: string; slug: string; title: string; agency: string; totalValue: number; tradeCount: number }
  >();
  for (const t of trades) {
    if (!officialGroups.has(t.officialSlug)) {
      officialGroups.set(t.officialSlug, {
        name: t.officialName,
        slug: t.officialSlug,
        title: t.officialTitle,
        agency: t.agency,
        totalValue: 0,
        tradeCount: 0,
      });
    }
    const g = officialGroups.get(t.officialSlug)!;
    g.totalValue += amountRangeToMidpoint(t.amount as AmountRange);
    g.tradeCount += 1;
  }

  const officials = Array.from(officialGroups.values()).sort(
    (a, b) => b.totalValue - a.totalValue
  );

  const totalValue = trades.reduce(
    (sum, t) => sum + amountRangeToMidpoint(t.amount as AmountRange),
    0
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <Link
        href="/companies"
        className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
      >
        ← Back to company lookup
      </Link>

      <header className="mt-6 mb-12">
        <div className="flex items-baseline gap-3">
          <h1 className="font-[family-name:var(--font-instrument-serif)] text-4xl text-neutral-900">
            {company.ticker}
          </h1>
          <span className="text-neutral-500">{company.companyName}</span>
        </div>
      </header>

      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-neutral-500 border-b border-neutral-200 pb-6 mb-10">
        <div>
          <span className="text-lg font-semibold text-neutral-900 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1">
            {officials.length}
          </span>
          {officials.length === 1 ? "official" : "officials"}
        </div>
        <div>
          <span className="text-lg font-semibold text-neutral-900 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1">
            {trades.length}
          </span>
          trades
        </div>
        <div>
          <span className="text-lg font-semibold text-neutral-900 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1">
            ~{formatCompactCurrency(totalValue)}
          </span>
          est. value
        </div>
      </div>

      {officials.length > 1 && (
        <CompanyBarChart officials={officials} ticker={company.ticker} />
      )}

      <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
        All Trades
      </h2>
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-900 text-xs uppercase tracking-wider text-neutral-500">
              <th className="pb-2 pr-4 font-medium">Date</th>
              <th className="pb-2 pr-4 font-medium">Official</th>
              <th className="pb-2 pr-4 font-medium">Type</th>
              <th className="pb-2 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => (
              <tr
                key={`${t.officialSlug}-${t.date}-${i}`}
                className={`border-b border-neutral-100 ${
                  i % 2 === 1 ? "bg-neutral-50/50" : ""
                }`}
              >
                <td className="py-2.5 pr-4 tabular-nums text-neutral-500 whitespace-nowrap">
                  {formatDate(t.date)}
                </td>
                <td className="py-2.5 pr-4">
                  <Link
                    href={`/officials/${t.officialSlug}`}
                    className="text-neutral-900 hover:underline"
                  >
                    {t.officialName}
                  </Link>
                  <div className="text-xs text-neutral-400">{t.officialTitle}</div>
                </td>
                <td className="py-2.5 pr-4 whitespace-nowrap">
                  <span
                    className={
                      isSale(t.type) ? "text-red-700" : t.type === "Purchase" ? "text-emerald-700" : ""
                    }
                  >
                    {t.type}
                  </span>
                </td>
                <td className="py-2.5 text-right tabular-nums font-[family-name:var(--font-dm-mono)] text-neutral-600 whitespace-nowrap">
                  {amountRangeLabel(t.amount as AmountRange)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-400 mt-8">
        Source: U.S. Office of Government Ethics. Values reported in ranges per
        federal law.
      </p>
    </div>
  );
}
