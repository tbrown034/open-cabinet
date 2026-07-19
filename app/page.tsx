import { getOfficialsIndex, getAllOfficials, getTradesByTicker } from "@/lib/data";
import {
  amountRangeToMidpoint,
  formatCompactCurrency,
  displayName,
  formatDate,
} from "@/lib/format";
import { getNewsCoverage } from "@/lib/news";
import OfficialsTable from "./components/officials-table";
import Explainer from "./components/explainer";
import HomeSwimPreview, { type PreviewOfficial } from "./components/home-swim-preview";
import AlertSignupForm from "./components/alert-signup-form";
import ProjectCrossPromo from "./components/project-cross-promo";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Open Cabinet — Executive Branch Stock Tracker",
  description:
    "The first interactive stock tracker for the executive branch. Search 10,000+ transactions by cabinet secretaries and senior officials, sourced from U.S. Office of Government Ethics filings.",
};

function isSale(type: string): boolean {
  return type === "Sale" || type === "Sale (Partial)" || type === "Sale (Full)";
}

export default async function Home() {
  const [index, allOfficials, news, tickerMap] = await Promise.all([
    getOfficialsIndex(),
    getAllOfficials(),
    getNewsCoverage(),
    getTradesByTicker(),
  ]);
  // Real number of distinct tickers, computed the same way the Company
  // Lookup page counts them (getTradesByTicker keys). Never hardcode this,
  // the two pages must always agree.
  const companyCount = tickerMap.size;
  // Drop prior-administration holdovers from the directory, counts and banner.
  const officials = index.officials.filter((o) => !o.formerOfficial);
  const officialsBySlug = new Map(allOfficials.map((o) => [o.slug, o]));

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
  // Headline accountability finding, surfaced on the hero: the share of all
  // disclosed trades reported after the STOCK Act deadline.
  const latePct =
    allTx.length > 0 ? Math.round((lateCount / allTx.length) * 100) : 0;

  // Most recent OGE filing/posting date across all officials.
  const mostRecentFiling = officials.reduce(
    (latest, o) =>
      o.mostRecentFilingDate > latest ? o.mostRecentFilingDate : latest,
    ""
  );

  // "New on Open Cabinet", driven by lastIngestedDate (when our pipeline
  // added or updated this official's data), NOT by mostRecentFilingDate
  // (which is the OGE filing/posting date and can be weeks older when we
  // ingest a backlog). 14-day window: long enough that a weekend visitor still sees
  // the banner, short enough that it fades naturally.
  const indexDate = new Date(index.lastUpdated + "T00:00:00");
  const newCutoff = new Date(indexDate.getTime() - 14 * 24 * 60 * 60 * 1000);
  const newCutoffStr = newCutoff.toISOString().split("T")[0];
  const recentFilers = [];
  for (const o of officials) {
    if (!o.lastIngestedDate || o.lastIngestedDate < newCutoffStr) continue;
    const full = officialsBySlug.get(o.slug);
    const txDates = full?.transactions.map((t) => t.date).toSorted() ?? [];
    const txCount = full?.transactions.length ?? o.transactionCount;
    const newCount = o.lastIngestedNewCount ?? 0;
    // First time we've published this official, when the ingest delta
    // equals the full transaction count, the whole record is new on the
    // site, not just additions to an existing page.
    const isFirstAppearance = newCount > 0 && newCount === txCount;
    recentFilers.push({
      slug: o.slug,
      name: o.name,
      filingDate: o.mostRecentFilingDate,
      ingestedDate: o.lastIngestedDate,
      newCount,
      txCount,
      isFirstAppearance,
      earliestTx: txDates[0] ?? "",
      latestTx: txDates[txDates.length - 1] ?? "",
    });
  }
  recentFilers
    // New officials first (biggest news), then most recently filed
    .sort((a, b) => {
      if (a.isFirstAppearance !== b.isFirstAppearance) {
        return a.isFirstAppearance ? -1 : 1;
      }
      return b.filingDate.localeCompare(a.filingDate);
    });

  const BANNER_VISIBLE = 3;
  const bannerVisible = recentFilers.slice(0, BANNER_VISIBLE);
  const bannerOverflow = recentFilers.slice(BANNER_VISIBLE);
  const overflowTrades = bannerOverflow.reduce((s, o) => s + o.newCount, 0);
  const newPeopleCount = recentFilers.filter((o) => o.isFirstAppearance).length;
  const updatedCount = recentFilers.length - newPeopleCount;

  const recentNews = news.slice(0, 4);

  const swimPreview: PreviewOfficial[] = allOfficials
    .map((o) => ({
      name: o.name,
      slug: o.slug,
      title: o.title,
      totalValue: o.transactions.reduce(
        (sum, tx) => sum + amountRangeToMidpoint(tx.amount),
        0
      ),
      transactions: o.transactions.map((tx) => ({
        description: tx.description,
        ticker: tx.ticker,
        type: tx.type,
        date: tx.date,
        amount: tx.amount,
        isSale: isSale(tx.type),
        lateFiled: tx.lateFilingFlag,
      })),
    }))
    .toSorted((a, b) => b.totalValue - a.totalValue)
    .map(({ name, slug, title, transactions }) => ({
      name,
      slug,
      title,
      transactions,
    }));

  return (
    <div>
      {/* ── NEW FILINGS BANNER ──
          Shows the top 3 most-newsworthy ingests inline. New officials
          (first appearance on the site) outrank updates. Anything beyond
          the cap rolls up into a single trailing count so the banner
          stays one to four lines tall regardless of ingest volume. */}
      {recentFilers.length > 0 && (
        <div className="bg-neutral-900 text-white">
          <div className="mx-auto max-w-5xl px-4 py-3 text-sm">
            <div className="flex items-baseline gap-3 mb-1.5">
              <span className="bg-white text-neutral-900 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 shrink-0">
                New
              </span>
              <span className="text-neutral-400 text-xs uppercase tracking-wider">
                {newPeopleCount > 0 && (
                  <>
                    {newPeopleCount} new official{newPeopleCount === 1 ? "" : "s"}
                    {updatedCount > 0 ? " · " : ""}
                  </>
                )}
                {updatedCount > 0 && (
                  <>
                    {updatedCount} updated filing{updatedCount === 1 ? "" : "s"}
                  </>
                )}
                {" "}added in the last 14 days
              </span>
            </div>
            <ul className="text-neutral-300 space-y-0.5">
              {bannerVisible.map((o) => (
                <li
                  key={o.slug}
                  className="flex flex-wrap items-baseline gap-x-2"
                >
                  {o.isFirstAppearance && (
                    <span className="bg-amber-300 text-amber-950 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 shrink-0">
                      New official
                    </span>
                  )}
                  <Link
                    href={`/officials/${o.slug}`}
                    className="text-white underline hover:text-neutral-200"
                  >
                    {displayName(o.name)}
                  </Link>
                  <span className="text-neutral-500 text-xs">
                    posted {formatDate(o.filingDate)}
                  </span>
                  {o.newCount > 0 && (
                    <span className="text-neutral-400 text-xs">
                      &middot;{" "}
                      {o.isFirstAppearance
                        ? `${o.newCount.toLocaleString()} trade${o.newCount === 1 ? "" : "s"}`
                        : `+${o.newCount.toLocaleString()} new trade${o.newCount === 1 ? "" : "s"}`}
                    </span>
                  )}
                </li>
              ))}
              {bannerOverflow.length > 0 && (
                <li className="text-neutral-400 text-xs pt-0.5">
                  + {bannerOverflow.length} more updated
                  {" "}({overflowTrades.toLocaleString()} additional trade
                  {overflowTrades === 1 ? "" : "s"}).{" "}
                  <Link
                    href="#directory"
                    className="underline hover:text-neutral-200"
                  >
                    See directory
                  </Link>
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* ── HERO ── */}
      <div className="mx-auto max-w-5xl px-4 pt-16 pb-12">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          <header className="flex-1">
            <h1 className="font-[family-name:var(--font-source-serif)] text-4xl md:text-5xl text-neutral-900 mb-4 leading-tight">
              What Is Trump’s Cabinet
              <br />
              Buying and Selling?
            </h1>
            <p className="text-neutral-500 max-w-xl leading-relaxed">
              Individual stock trades disclosed to the Office of Government
              Ethics &mdash; the slice of executive financial activity the
              public is allowed to see. Open Cabinet makes the filings
              sortable, searchable and visual.
            </p>
            <p className="mt-5 text-base text-neutral-800 leading-relaxed max-w-xl">
              And most of it arrives late:{" "}
              <Link
                href="/late-filings"
                className="font-semibold text-amber-700 underline decoration-amber-700/30 underline-offset-2 hover:decoration-amber-700 transition-colors"
              >
                {latePct}% of disclosed trades were reported after the STOCK Act
                deadline
              </Link>
              .
            </p>
            <p className="text-xs text-neutral-400 mt-3">
              Latest filing posted to OGE:{" "}
              {formatDate(mostRecentFiling)}{" "}
              · Data checked weekly
            </p>
          </header>

          {/* Hero graphic, abstract swim lane preview */}
          <div className="hidden md:flex items-center justify-center size-48 shrink-0">
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
            officials<Link href="#coverage-note" className="text-blue-500 hover:text-blue-700 ml-0.5 text-base font-bold no-underline">*</Link>
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
            trade volume (est.)<Link href="/methodology#known-limitations" className="text-blue-500 hover:text-blue-700 ml-0.5 text-base font-bold no-underline">*</Link>
          </div>
          <div>
            <span className="text-2xl font-semibold text-amber-700 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1.5">
              {lateCount.toLocaleString()}
            </span>
            late-filed transactions<Link href="/late-filings" className="text-blue-500 hover:text-blue-700 ml-0.5 text-base font-bold no-underline">*</Link>
          </div>
        </div>
        <p className="text-xs text-neutral-400 mt-2 pb-4 border-b border-neutral-200">
          Transactions filed January 2025 to present. Trade volume is the
          midpoint of the reporting ranges, summed across all disclosed
          transactions &mdash; not portfolio value, net worth or exposure.
          A single position bought and later sold counts twice.
        </p>

        {/* id="alerts" is the anchor target for the digest email's follow-all CTA. */}
        <div id="alerts" className="mt-6 scroll-mt-20">
          <AlertSignupForm sourcePage="home-stats" />
        </div>

        {/* ── SWIM LANE PREVIEW ── */}
        <div className="mt-8">
          <HomeSwimPreview
            officials={swimPreview}
            totalOfficials={totalOfficials}
          />
        </div>
      </div>

      {/* ── DIRECTORY PREVIEW ── */}
      <div id="directory" className="mx-auto max-w-5xl px-4 pb-6 scroll-mt-20">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900">
              Tracked officials
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              Executive Level I and II officials, cabinet secretaries, agency
              heads and senior appointees confirmed by the Senate.
            </p>
          </div>
        </div>

        <OfficialsTable
          officials={officials}
          initialLimit={10}
          newIngestedCutoff={newCutoffStr}
        />

        <div id="coverage-note" className="bg-stone-50 border border-neutral-200 px-4 py-3 text-xs text-neutral-500 leading-relaxed scroll-mt-24 mt-6">
          <p>
            <strong className="text-neutral-700">*Why these officials?</strong>{" "}
            Open Cabinet tracks {totalOfficials} executive branch officials
            whose 278-T transaction reports are directly downloadable from
            OGE{"'"}s public portal. The directory excludes prior-administration
            holdovers but keeps recent former officials when their filings are
            part of the current executive-branch record. Hundreds more have
            filed reports that require individual{" "}
            <a href="https://extapps2.oge.gov/201/Presiden.nsf" className="underline hover:text-neutral-600" target="_blank" rel="noopener noreferrer">
              Form 201 requests
            </a>
            . This is an{" "}
            <a href="https://github.com/tbrown034/open-cabinet" className="underline hover:text-neutral-600" target="_blank" rel="noopener noreferrer">
              open-source project
            </a>
            {" "}&mdash; expanding coverage is an ongoing goal. For raw disclosure
            documents across 1,500+ appointees, see{" "}
            <a href="https://projects.propublica.org/trump-team-financial-disclosures/" className="underline hover:text-neutral-600" target="_blank" rel="noopener noreferrer">
              ProPublica
            </a>
            . For legislative branch tracking, see{" "}
            <a href="https://www.capitoltrades.com" className="underline hover:text-neutral-600" target="_blank" rel="noopener noreferrer">
              Capitol Trades
            </a>
            .
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
                  Search by ticker to see which officials traded each stock.
                  {" "}{companyCount.toLocaleString()} companies tracked.
                </p>
              </div>
              <span className="text-neutral-300 group-hover:text-neutral-900 transition-colors text-lg mt-0.5 ml-3 shrink-0">&rarr;</span>
            </Link>
            <Link
              href="/methodology"
              className="border border-neutral-200 bg-white px-5 py-4 hover:border-neutral-900 hover:bg-neutral-50 transition-colors group flex justify-between items-start"
            >
              <div>
                <div className="text-sm font-medium text-neutral-900 group-hover:underline">
                  Methodology
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

      <ProjectCrossPromo />

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
              Collected via AI-assisted search. Checked weekly.
            </p>
            <div className="space-y-4">
              {recentNews.map((item) => (
                <div
                  key={item.url}
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
                    {item.source} · {formatDate(item.date)}
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
