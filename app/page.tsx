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
  const mostRecentFiling = officials.reduce(
    (latest, o) =>
      o.mostRecentFilingDate > latest ? o.mostRecentFilingDate : latest,
    ""
  );

  const recentNews = news.slice(0, 4);

  return (
    <div>
      {/* ── HERO ── */}
      <div className="mx-auto max-w-5xl px-4 pt-16 pb-12">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          <header className="flex-1">
            <h1 className="font-[family-name:var(--font-source-serif)] text-4xl md:text-5xl text-neutral-900 mb-4 leading-tight">
              What is Trump{"'"}s Cabinet
              <br />
              buying and selling?
            </h1>
            <p className="text-neutral-500 max-w-xl leading-relaxed">
              Senior officials must disclose individual stock trades and
              potential conflicts of interest, but the filings are scattered
              across PDFs and hard to search. Open Cabinet makes them
              sortable, searchable and visual.
            </p>
            <p className="text-xs text-neutral-400 mt-3">
              Published April 12, 2026 · Most recent filing:{" "}
              {new Date(mostRecentFiling + "T00:00:00").toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", year: "numeric" }
              )}
            </p>
          </header>

          {/* Hero graphic — abstract swim lane preview */}
          <div className="hidden md:flex items-center justify-center w-48 h-48 shrink-0">
            <svg
              viewBox="0 0 200 200"
              className="w-full h-full"
              aria-hidden="true"
            >
              {/* Abstract trade dots evoking the swim lane chart */}
              {[
                { y: 25, dots: [{ x: 35, r: 5, s: true }, { x: 55, r: 3, s: false }, { x: 70, r: 7, s: true }, { x: 95, r: 4, s: false }, { x: 120, r: 3, s: true }, { x: 145, r: 6, s: true }, { x: 165, r: 4, s: false }] },
                { y: 53, dots: [{ x: 40, r: 4, s: false }, { x: 60, r: 6, s: true }, { x: 80, r: 3, s: true }, { x: 110, r: 5, s: false }] },
                { y: 81, dots: [{ x: 32, r: 7, s: true }, { x: 50, r: 5, s: true }, { x: 68, r: 4, s: true }, { x: 85, r: 3, s: true }, { x: 100, r: 6, s: true }] },
                { y: 109, dots: [{ x: 45, r: 3, s: false }, { x: 75, r: 8, s: true }, { x: 130, r: 5, s: false }, { x: 155, r: 4, s: true }] },
                { y: 137, dots: [{ x: 38, r: 4, s: true }, { x: 55, r: 3, s: false }, { x: 90, r: 5, s: true }] },
                { y: 165, dots: [{ x: 50, r: 6, s: false }, { x: 80, r: 3, s: true }, { x: 105, r: 4, s: false }, { x: 140, r: 7, s: true }, { x: 170, r: 3, s: false }] },
              ].map((row, i) => (
                <g key={i}>
                  <line x1="10" y1={row.y} x2="190" y2={row.y} stroke="#e5e5e5" strokeWidth="0.5" />
                  {row.dots.map((d, j) => (
                    <circle key={j} cx={d.x} cy={row.y} r={d.r} fill={d.s ? "#dc2626" : "#16a34a"} opacity={0.7} />
                  ))}
                </g>
              ))}
              {/* Vertical line evoking inauguration marker */}
              <line x1="45" y1="12" x2="45" y2="180" stroke="#525252" strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />
            </svg>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-x-8 gap-y-2 mt-10 text-sm text-neutral-500 border-b border-neutral-200 pb-4">
          <div>
            <span className="text-2xl font-semibold text-neutral-900 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1.5">
              {totalOfficials}
            </span>
            officials<a href="#coverage-note" className="text-blue-500 hover:text-blue-700 ml-0.5 text-base font-bold no-underline">*</a>
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
            est. value<a href="/about#known-limitations" className="text-blue-500 hover:text-blue-700 ml-0.5 text-base font-bold no-underline">*</a>
          </div>
          <div>
            <span className="text-2xl font-semibold text-amber-700 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1.5">
              {lateCount}
            </span>
            late filings<a href="/late-filings" className="text-blue-500 hover:text-blue-700 ml-0.5 text-base font-bold no-underline">*</a>
          </div>
        </div>
        <p className="text-xs text-neutral-400 mt-2 pb-4 border-b border-neutral-200">
          Transactions filed January 2025 to present. Dollar values are estimates based on statutory reporting ranges.
        </p>
      </div>

      {/* ── DIRECTORY PREVIEW ── */}
      <div id="directory" className="mx-auto max-w-5xl px-4 pb-6 scroll-mt-20">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900">
              Top officials by trading volume
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              Executive Level I and II officials — cabinet secretaries, agency
              heads and senior appointees confirmed by the Senate.
            </p>
          </div>
        </div>

        <OfficialsTable officials={officials} initialLimit={10} />

        <div id="coverage-note" className="bg-stone-50 border border-neutral-200 px-4 py-3 text-xs text-neutral-500 leading-relaxed scroll-mt-24 mt-6">
          <p>
            <strong className="text-neutral-700">*Why these officials?</strong>{" "}
            Open Cabinet tracks {totalOfficials} officials whose 278-T
            transaction reports are directly downloadable from OGE{"'"}s public
            portal. These are Executive Level I and II positions — the most
            senior appointees. Approximately 248 additional officials have
            filed transaction reports but their PDFs require individual{" "}
            <a
              href="https://extapps2.oge.gov/201/Presiden.nsf"
              className="underline hover:text-neutral-600"
              target="_blank"
              rel="noopener noreferrer"
            >
              Form 201 requests
            </a>{" "}
            from OGE, including officials like Dr. Oz, Jeanine Pirro, Kelly
            Loeffler and Kash Patel.
          </p>
          <p className="mt-2">
            This is an{" "}
            <a
              href="https://github.com/tbrown034/open-cabinet"
              className="underline hover:text-neutral-600"
              target="_blank"
              rel="noopener noreferrer"
            >
              open-source project
            </a>
            . Expanding coverage to more officials is a{" "}
            <a
              href="https://github.com/tbrown034/open-cabinet/issues"
              className="underline hover:text-neutral-600"
              target="_blank"
              rel="noopener noreferrer"
            >
              documented goal
            </a>
            .{" "}
            The team at{" "}
            <a
              href="https://projects.propublica.org/trump-team-financial-disclosures/"
              className="underline hover:text-neutral-600"
              target="_blank"
              rel="noopener noreferrer"
            >
              ProPublica
            </a>{" "}
            maintains a broader database covering raw disclosure documents for
            1,500+ appointees.
          </p>
        </div>
      </div>

      {/* ── EXPLORE MORE (CTAs) ── */}
      <div className="bg-stone-50 -mx-0 py-10">
        <div className="mx-auto max-w-5xl px-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link
              href="/all"
              className="border border-neutral-200 bg-white px-5 py-4 hover:border-neutral-900 hover:bg-neutral-50 transition-colors group flex justify-between items-start"
            >
              <div>
                <div className="text-sm font-medium text-neutral-900 group-hover:underline">
                  All Trades
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  {totalTransactions.toLocaleString()} transactions across{" "}
                  {totalOfficials} officials on one swim lane chart.
                </p>
              </div>
              <span className="text-neutral-300 group-hover:text-neutral-900 transition-colors text-lg mt-0.5 ml-3 shrink-0">&rarr;</span>
            </Link>
            <Link
              href="/companies"
              className="border border-neutral-200 bg-white px-5 py-4 hover:border-neutral-900 hover:bg-neutral-50 transition-colors group flex justify-between items-start"
            >
              <div>
                <div className="text-sm font-medium text-neutral-900 group-hover:underline">
                  Company Lookup
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  Search by ticker to see which officials traded each stock. 578
                  companies tracked.
                </p>
              </div>
              <span className="text-neutral-300 group-hover:text-neutral-900 transition-colors text-lg mt-0.5 ml-3 shrink-0">&rarr;</span>
            </Link>
            <Link
              href="/about"
              className="border border-neutral-200 bg-white px-5 py-4 hover:border-neutral-900 hover:bg-neutral-50 transition-colors group flex justify-between items-start"
            >
              <div>
                <div className="text-sm font-medium text-neutral-900 group-hover:underline">
                  How This Works
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  The STOCK Act, divestiture deadlines and how we built this
                  tracker from OGE data.
                </p>
              </div>
              <span className="text-neutral-300 group-hover:text-neutral-900 transition-colors text-lg mt-0.5 ml-3 shrink-0">&rarr;</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ── EXPLAINER (scrollytelling) ── */}
      <div className="mx-auto max-w-5xl px-4">
        <Explainer />
      </div>

      {/* ── IN THE NEWS ── */}
      {recentNews.length > 0 && (
        <section className="bg-stone-50 -mx-0 px-4 py-10 mt-10">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-1">
              In the News
            </h2>
            <p className="text-sm text-neutral-500 mb-1">
              Published reporting on executive branch financial conflicts from
              ProPublica, CNBC, NOTUS and other outlets.
            </p>
            <p className="text-xs text-neutral-400 mb-6">
              Collected via AI-assisted search. Checked weekly. Last updated{" "}
              {new Date().toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}.
            </p>
            <div className="space-y-4">
              {recentNews.map((item, i) => (
                <div
                  key={i}
                  className="bg-white border border-neutral-200 px-4 py-3 text-sm"
                >
                  <a
                    href={item.url}
                    className="text-neutral-900 hover:underline font-medium"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.headline}
                  </a>
                  <div className="text-xs text-neutral-400 mt-1">
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
          </div>
        </section>
      )}
    </div>
  );
}
