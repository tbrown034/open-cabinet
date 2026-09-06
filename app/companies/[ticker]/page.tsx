import UnderReviewNote from "@/app/components/under-review-note";
import VerificationMarker from "@/app/components/verification-marker";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTradesByTicker, getAllTickers, COMPANY_CONTEXT } from "@/lib/data";
import { formatDate, rowsForTotals, amountRangeLabel, formatCompactCurrency, displayName, sumAmountEstimates, transactionEstimate } from "@/lib/format";
import CompanyBarChart from "@/app/components/company-bar-chart";
import { INSTRUMENT_TYPE_LABEL } from "@/lib/asset-registry";
import type { AssetLookup } from "@/lib/asset-registry";

export async function generateStaticParams() {
  const tickers = await getAllTickers();
  return tickers.map((ticker) => ({ ticker: ticker.toLowerCase() }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const [{ ticker }, tickerMap] = await Promise.all([
    params,
    getTradesByTicker(),
  ]);
  const company = tickerMap.get(ticker.toUpperCase());
  if (!company) return { title: "Not Found" };
  const trades = rowsForTotals(company.trades, company.trades.map((t) => t.verification));
  const officialCount = new Set(trades.map((t) => t.officialSlug)).size;
  return {
    // Lowercase self-canonical also collapses /companies/AAPL and
    // /companies/aapl (both serve identical content) into one indexed URL.
    alternates: { canonical: `/companies/${company.ticker.toLowerCase()}` },
    title: `${company.ticker}: Who in Government Trades This Stock`,
    // Many company names already end in a period ("NVIDIA Corp.", "Apple,
    // Inc."), so appending one produced "NVIDIA Corp.." in every search
    // result for those tickers.
    description: `${officialCount} executive branch official${officialCount !== 1 ? "s" : ""} reported ${trades.length} trade${trades.length !== 1 ? "s" : ""} in ${company.companyName.replace(/\.$/, "")}.`,
    openGraph: {
      title: `${company.ticker}: Who in Government Trades This Stock — Open Cabinet`,
      description: `${officialCount} official${officialCount !== 1 ? "s" : ""}, ${trades.length} trade${trades.length !== 1 ? "s" : ""} in ${company.companyName}.`,
      type: "website",
    },
  };
}

function isSale(type: string): boolean {
  return type === "Sale" || type === "Sale (Partial)" || type === "Sale (Full)";
}

/**
 * What the registry knows about this symbol, and what the filings called
 * it. The SEC line is provenance (name, CIK, fetch date); the filed-as line
 * is every distinct description on the rows below, so a reader can see when
 * a brokerage string and the SEC name differ, as they do for LOWES
 * COMPANIES INC and "Lowe's Cos., Inc."
 */
function RegistryLine({ registry }: { registry: AssetLookup }) {
  if (registry.kind === "unknown") return null;
  const entry = registry.entry;
  const typeLabel = INSTRUMENT_TYPE_LABEL[entry.instrumentType];
  const typeNote = entry.instrumentTypeSource === "reviewed" ? "" : " (inferred from the name, not yet reviewed)";
  const filedAs = entry.filedAs;
  const shown = filedAs.slice(0, 6);
  const more = filedAs.length - shown.length;
  return (
    <div className="text-sm text-neutral-500 mt-3 max-w-2xl space-y-1">
      {registry.kind === "sec" ? (
        <p>
          SEC registrant: {registry.entry.secName}, CIK {registry.entry.cik}
          {registry.entry.secSymbol !== registry.entry.symbol ? `, listed as ${registry.entry.secSymbol}` : ""}.{" "}
          {typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)}
          {typeNote}. From the SEC company list fetched {registry.entry.source.fetchedAt.slice(0, 10)}.
        </p>
      ) : (
        <p>
          Not in the SEC company list (funds registered under the 1940 Act and over-the-counter
          receipts are not on it). Identity pending review. {typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)}
          {typeNote}.
        </p>
      )}
      {entry.aliases.length > 0 && (
        <p>
          Also filed under the symbol{entry.aliases.length === 1 ? "" : "s"}{" "}
          {entry.aliases.map((a) => a.filedSymbol).join(", ")}, folded here with the evidence recorded in the registry.
        </p>
      )}
      <p>
        Filed as: {shown.map((d, i) => (
          <span key={d}>
            {i > 0 ? "; " : ""}
            <span className="text-neutral-700">{d}</span>
          </span>
        ))}
        {more > 0 ? ` and ${more} more` : ""}.
      </p>
    </div>
  );
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const [{ ticker }, tickerMap] = await Promise.all([
    params,
    getTradesByTicker(),
  ]);
  const company = tickerMap.get(ticker.toUpperCase());

  if (!company) {
    notFound();
  }

  const trades = rowsForTotals(company.trades, company.trades.map((t) => t.verification));
  const underReviewCount = company.trades.length - trades.length;
  const sorted = company.trades.toSorted(
    (a, b) => (b.date ? new Date(b.date).getTime() : -Infinity) - (a.date ? new Date(a.date).getTime() : -Infinity)
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
    g.totalValue += transactionEstimate(t) ?? 0;
    g.tradeCount += 1;
  }

  const officials = Array.from(officialGroups.values()).toSorted(
    (a, b) => b.totalValue - a.totalValue
  );

  const totalValue = sumAmountEstimates(trades).estimate;

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
          <h1 className="font-[family-name:var(--font-source-serif)] text-4xl text-neutral-900">
            {company.ticker}
          </h1>
          <span className="text-neutral-500">{company.companyName}</span>
        </div>
        {COMPANY_CONTEXT[company.ticker] && (
          <p className="text-sm text-neutral-400 mt-2 max-w-2xl">
            {COMPANY_CONTEXT[company.ticker]}
          </p>
        )}
        <RegistryLine registry={company.registry} />
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
          trade volume (est.)
        </div>
      </div>

      <UnderReviewNote count={underReviewCount} />

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
              <th className="pb-2 pl-4 font-medium">Verification</th>
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
                  {t.date ? formatDate(t.date) : "N/A"}
                </td>
                <td className="py-2.5 pr-4">
                  <Link
                    href={`/officials/${t.officialSlug}`}
                    className="text-neutral-900 hover:underline"
                  >
                    {displayName(t.officialName)}
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
                  {t.amount ? amountRangeLabel(t.amount) : "Not ascertainable"}
                </td>
                <td className="py-2.5 pl-4"><VerificationMarker verification={t.verification} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-400 mt-8">
        Source: U.S. Office of Government Ethics. Values reported in ranges per
        federal law. Not comprehensive: only trades whose filings print a
        ticker symbol appear here — officials whose filings list securities by
        name alone (including President Trump) are not represented.
      </p>
    </div>
  );
}
