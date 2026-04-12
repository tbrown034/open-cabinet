import { getOfficialsIndex, getAllOfficials } from "@/lib/data";
import { amountRangeToMidpoint, formatCompactCurrency } from "@/lib/format";
import { getNewsCoverage } from "@/lib/news";
import OfficialsTable from "./components/officials-table";
import Explainer from "./components/explainer";
import Link from "next/link";

export default async function Home() {
  const index = await getOfficialsIndex();
  const allOfficials = await getAllOfficials();
  const news = await getNewsCoverage();
  const { officials } = index;

  const totalOfficials = officials.length;
  const totalTransactions = officials.reduce(
    (sum, o) => sum + o.transactionCount,
    0
  );

  const allTx = allOfficials.flatMap((o) => o.transactions);
  const estimatedTotal = allTx.reduce(
    (sum, tx) => sum + amountRangeToMidpoint(tx.amount),
    0
  );
  const lateCount = allTx.filter((tx) => tx.lateFilingFlag).length;

  // Most recent filing date across all officials
  const mostRecentFiling = officials.reduce((latest, o) =>
    o.mostRecentFilingDate > latest ? o.mostRecentFilingDate : latest,
    ""
  );

  const recentNews = news.slice(0, 4);

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <header className="mb-12">
        <h1 className="font-[family-name:var(--font-instrument-serif)] text-4xl md:text-5xl text-neutral-900 mb-4 leading-tight">
          Executive Branch
          <br />
          Financial Disclosures
        </h1>
        <p className="text-neutral-500 max-w-xl leading-relaxed">
          The STOCK Act requires senior federal officials to publicly disclose
          their stock trades. Congress has 19 trackers. The executive branch has
          had none — until now.
        </p>
      </header>

      <div className="flex flex-wrap gap-x-8 gap-y-2 mb-12 text-sm text-neutral-500 border-b border-neutral-200 pb-6">
        <div>
          <span className="text-2xl font-semibold text-neutral-900 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1.5">
            {totalOfficials}
          </span>
          officials
        </div>
        <div>
          <span className="text-2xl font-semibold text-neutral-900 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1.5">
            {totalTransactions.toLocaleString()}
          </span>
          transactions
        </div>
        <div>
          <span className="text-2xl font-semibold text-neutral-900 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1.5">
            ~{formatCompactCurrency(estimatedTotal)}
          </span>
          est. value
        </div>
        <div>
          <span className="text-2xl font-semibold text-amber-700 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1.5">
            {lateCount}
          </span>
          late filings
        </div>
      </div>

      <OfficialsTable officials={officials} />

      <p className="text-xs text-neutral-400 mt-6 mb-12">
        Showing {totalOfficials} of 43 officials with publicly downloadable
        filings. Approximately 179 additional officials have filed reports that
        require individual requests from OGE. Most recent filing:{" "}
        {mostRecentFiling}.
      </p>

      <Explainer />

      {recentNews.length > 0 && (
        <section className="border-t border-neutral-200 pt-10">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
            Recent Coverage
          </h2>
          <div className="space-y-4">
            {recentNews.map((item, i) => (
              <div
                key={i}
                className="border-l-2 border-neutral-200 pl-4 text-sm"
              >
                <a
                  href={item.url}
                  className="text-neutral-900 hover:underline font-medium"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.headline}
                </a>
                <div className="text-xs text-neutral-400 mt-0.5">
                  {item.source} · {item.date}
                  {item.official && (
                    <>
                      {" · "}
                      <Link
                        href={`/officials/${item.official}`}
                        className="hover:underline"
                      >
                        View profile
                      </Link>
                    </>
                  )}
                </div>
                <p className="text-neutral-500 mt-1">{item.relevance}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
