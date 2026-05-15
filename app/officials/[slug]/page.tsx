import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getOfficialBySlug, getAllOfficialSlugs, getOfficialsIndex } from "@/lib/data";
import {
  formatDate,
  amountRangeLabel,
  displayName,
  getSourceFilingForTransaction,
} from "@/lib/format";
import { getNewsForOfficial } from "@/lib/news";
import {
  getHoldingsForOfficial,
  reconcileHoldingsAgainstTrades,
} from "@/lib/holdings";
import type { Transaction } from "@/lib/types";
import TransactionTimeline from "@/app/components/transaction-timeline";
import MonthlyBars from "@/app/components/monthly-bars";
import RangeFilter from "@/app/components/range-filter";
import TransactionFilters from "@/app/components/transaction-filters";
import type { TxTypeFilter } from "@/app/components/transaction-filters";
import Pagination from "@/app/components/pagination";
import ViewToggle from "@/app/components/view-toggle";
import type { ChartView } from "@/app/components/view-toggle";
import OfficialAvatar from "@/app/components/official-avatar";
import HoldingsReconciliation from "@/app/components/holdings-reconciliation";
import DivestitureLedger from "@/app/components/divestiture-ledger";
import SourceDocuments from "@/app/components/source-documents";
import {
  getDivestitureData,
  buildPromiseEvidence,
} from "@/lib/divestiture";
import { getSourceDocuments } from "@/lib/source-docs";

export async function generateStaticParams() {
  const slugs = await getAllOfficialSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const official = await getOfficialBySlug(slug);
  if (!official) return { title: "Not Found — Open Cabinet" };
  const displayName = official.name.split(",").reverse().join(" ").trim();
  return {
    title: `${displayName} Financial Trades — Open Cabinet`,
    description: official.summary || `Financial transaction data for ${displayName}, ${official.title}.`,
    openGraph: {
      title: `${displayName} Financial Trades — Open Cabinet`,
      description: `${official.transactions.length} transactions reported by ${displayName}, ${official.title}.`,
      type: "website",
    },
  };
}

function isSale(type: Transaction["type"]): boolean {
  return type === "Sale" || type === "Sale (Partial)" || type === "Sale (Full)";
}

type CareerEventStyle = "solid" | "dashed" | "dotted";
interface CareerEvent {
  date: string;
  label: string;
  style: CareerEventStyle;
  color: string;
}

function getCareerEvents(official: {
  confirmedDate?: string;
  tookOfficeDate?: string;
  ethicsAgreementDate?: string;
}): CareerEvent[] {
  const events: CareerEvent[] = [];
  const confirmDate = official.confirmedDate || official.tookOfficeDate;
  if (confirmDate) {
    events.push({
      date: confirmDate,
      label: official.tookOfficeDate ? "Took office" : "Confirmed",
      style: "solid",
      color: "#a3a3a3",
    });
    if (!official.tookOfficeDate) {
      const deadline = new Date(confirmDate + "T00:00:00");
      deadline.setDate(deadline.getDate() + 90);
      events.push({
        date: deadline.toISOString().split("T")[0],
        label: "90-day deadline",
        style: "dashed",
        color: "#f87171",
      });
    }
  }
  if (official.ethicsAgreementDate && confirmDate) {
    const diff = Math.abs(
      new Date(official.ethicsAgreementDate).getTime() -
        new Date(confirmDate).getTime()
    );
    if (diff > 7 * 24 * 60 * 60 * 1000) {
      events.push({
        date: official.ethicsAgreementDate,
        label: "Ethics agmt",
        style: "dotted",
        color: "#d4d4d4",
      });
    }
  }
  return events;
}

export default async function OfficialPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{
    range?: string;
    type?: string;
    month?: string;
    late?: string;
    page?: string;
    view?: string;
  }>;
}) {
  const { slug } = await params;
  const search = (await searchParams) ?? {};
  const official = await getOfficialBySlug(slug);

  if (!official) {
    // Canonical slugs are lastname-firstname. If a user lands on
    // firstname-lastname (a natural guess), redirect to the canonical URL.
    const parts = slug.split("-");
    if (parts.length >= 2) {
      const reversed = [parts[parts.length - 1], ...parts.slice(0, -1)].join("-");
      if (reversed !== slug && (await getOfficialBySlug(reversed))) {
        redirect(`/officials/${reversed}`);
      }
    }
    notFound();
  }

  const news = await getNewsForOfficial(slug);
  const holdings = await getHoldingsForOfficial(slug);
  const reconciliation = holdings
    ? reconcileHoldingsAgainstTrades(holdings, official.transactions)
    : null;
  const divestiture = await getDivestitureData(slug);
  const promiseEvidence = divestiture
    ? buildPromiseEvidence(divestiture, official.transactions)
    : null;
  const sourceDocs = await getSourceDocuments(slug);
  const index = await getOfficialsIndex();
  const { transactions } = official;
  const sorted = [...transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const totalTrades = transactions.length;
  const buys = transactions.filter((t) => t.type === "Purchase").length;
  const sells = transactions.filter((t) => isSale(t.type)).length;
  const lateFilings = transactions.filter((t) => t.lateFilingFlag).length;

  const dates = transactions.map((t) => new Date(t.date).getTime());
  const earliest = new Date(Math.min(...dates));
  const latest = new Date(Math.max(...dates));

  // Density-derived stats — surface the *rhythm* of the trading, not just
  // the cumulative count. These power the high-volume page tier.
  const countsByDay = new Map<string, number>();
  for (const t of transactions) {
    countsByDay.set(t.date, (countsByDay.get(t.date) ?? 0) + 1);
  }
  const countsByMonth = new Map<string, number>();
  for (const t of transactions) {
    const k = t.date.slice(0, 7);
    countsByMonth.set(k, (countsByMonth.get(k) ?? 0) + 1);
  }
  const peakDay = Array.from(countsByDay.entries()).sort(
    (a, b) => b[1] - a[1]
  )[0];
  const daysWithHundredPlus = Array.from(countsByDay.values()).filter(
    (n) => n >= 100
  ).length;
  const peakMonthEntry = Array.from(countsByMonth.entries()).sort(
    (a, b) => b[1] - a[1]
  )[0];
  const peakMonth = peakMonthEntry
    ? { month: peakMonthEntry[0], count: peakMonthEntry[1] }
    : null;
  const weeksSpan = Math.max(
    1,
    (latest.getTime() - earliest.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  const tradesPerWeek = totalTrades / weeksSpan;
  const uniqueAssets = new Set(
    transactions.map((t) => t.description.trim().toUpperCase())
  ).size;
  const maxMonthlyCount = Math.max(0, ...Array.from(countsByMonth.values()));

  // High-volume officials get the monthly bar chart as the dominant viz.
  // Threshold: either 500+ total trades or any single month over 50 — both
  // are densities at which the dot-timeline becomes a smear.
  const HIGH_VOLUME = totalTrades >= 500 || maxMonthlyCount >= 50;

  // Range filter — only meaningful for high-volume officials. Default to
  // 12-month rolling view, with explicit user override via ?range=.
  type Range = "ytd" | "12mo" | "all";
  const rawRange = (search.range ?? "").toLowerCase();
  const validRange: Range[] = ["ytd", "12mo", "all"];
  const range: Range = validRange.includes(rawRange as Range)
    ? (rawRange as Range)
    : HIGH_VOLUME
    ? "12mo"
    : "all";

  const now = new Date();
  let rangeStart: Date | null = null;
  if (range === "ytd") rangeStart = new Date(now.getFullYear(), 0, 1);
  else if (range === "12mo")
    rangeStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  const inRange = (t: Transaction) => {
    if (!rangeStart) return true;
    return new Date(t.date + "T00:00:00") >= rangeStart;
  };

  // Additional filters layered on top of the range filter. Each one is
  // URL-controlled by TransactionFilters / MonthlyBars (when clickToZoom)
  // so a journalist can permalink any combination.
  const rawType = (search.type ?? "all").toLowerCase();
  const typeFilter: TxTypeFilter = (
    ["all", "sale", "purchase", "late"].includes(rawType) ? rawType : "all"
  ) as TxTypeFilter;
  const monthFilter =
    typeof search.month === "string" && /^\d{4}-\d{2}$/.test(search.month)
      ? search.month
      : null;

  const passesType = (t: Transaction) => {
    if (typeFilter === "all") return true;
    if (typeFilter === "sale") return isSale(t.type);
    if (typeFilter === "purchase") return t.type === "Purchase";
    if (typeFilter === "late") return Boolean(t.lateFilingFlag);
    return true;
  };
  const passesMonth = (t: Transaction) =>
    !monthFilter || t.date.slice(0, 7) === monthFilter;

  const rangedTransactions = transactions.filter(inRange);
  // The bar chart respects range only — clicking a bar within the
  // chart is itself the month filter, so we don't want the chart to
  // collapse to a single bar when a month is selected.
  const chartTransactions = rangedTransactions;
  // The table and dot-timeline respect every filter, so they narrow to
  // the user's selection.
  const visibleTransactions = rangedTransactions
    .filter(passesType)
    .filter(passesMonth);
  const visibleSorted = [...visibleTransactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const monthLabel = monthFilter
    ? new Date(monthFilter + "-01T00:00:00").toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

  // Chart view toggle. Default to monthly bars for high-volume officials
  // (the dot view at 5K trades is a smear); default to dots for everyone
  // else (where individual transactions still resolve). Either way the
  // user can override with ?view=.
  const rawView = (search.view ?? "").toLowerCase();
  const chartView: ChartView =
    rawView === "dots" || rawView === "bars"
      ? (rawView as ChartView)
      : HIGH_VOLUME
      ? "bars"
      : "dots";

  // Table pagination — server-side, link-driven, no JS bundle. Default
  // page size 100, and we only paginate above a threshold where rendering
  // every row of HTML actually hurts (the dev-mode TTFB for Trump's
  // 5,011-row table was the user-visible problem). Officials with fewer
  // trades see the full table on one page.
  const TABLE_PAGE_SIZE = 100;
  const tableNeedsPaging = visibleSorted.length > TABLE_PAGE_SIZE;
  const totalPages = tableNeedsPaging
    ? Math.ceil(visibleSorted.length / TABLE_PAGE_SIZE)
    : 1;
  const rawPage = parseInt(search.page ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.min(rawPage, totalPages) : 1;
  const tableSlice = tableNeedsPaging
    ? visibleSorted.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE)
    : visibleSorted;

  // "New on Open Cabinet" banner — driven by lastIngestedDate (pipeline
  // signal), not the OGE post date. Stays up for 14 days. Also pulls in the
  // number of new transactions added on the latest ingest if available, so
  // the banner can say "+3,627 trades added" instead of conflating it with
  // the cumulative total.
  const ogeFilingDate = official.mostRecentFilingDate;
  const ingestedDate = official.lastIngestedDate;
  const newCount = official.lastIngestedNewCount ?? 0;
  const indexDate = new Date(index.lastUpdated + "T00:00:00");
  const recentCutoffStr = new Date(
    indexDate.getTime() - 14 * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .split("T")[0];
  const isRecentlyIngested = ingestedDate
    ? ingestedDate >= recentCutoffStr
    : false;
  // First-appearance = the ingest delta equals the whole transaction list,
  // meaning we just published this official for the first time. That's a
  // bigger story than an additive filing on an existing page.
  const isFirstAppearance =
    isRecentlyIngested && newCount > 0 && newCount === totalTrades;

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <Link
        href="/"
        className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
      >
        ← Back to directory
      </Link>

      {isRecentlyIngested && (
        <div className="mt-4 bg-neutral-900 text-white px-4 py-3 text-sm flex items-start gap-3">
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 shrink-0 mt-0.5 ${
              isFirstAppearance
                ? "bg-amber-300 text-neutral-900"
                : "bg-white text-neutral-900"
            }`}
          >
            {isFirstAppearance ? "New official" : "New filing"}
          </span>
          <span className="text-neutral-300">
            {isFirstAppearance ? (
              <>
                <span className="text-white font-medium">
                  {displayName(official.name)} is new on Open Cabinet.
                </span>{" "}
                We added {newCount.toLocaleString()} trade
                {newCount === 1 ? "" : "s"} from a 278-T posted to OGE on{" "}
                {formatDate(ogeFilingDate)} (ingested {formatDate(ingestedDate!)}).
              </>
            ) : newCount > 0 ? (
              <>
                <span className="text-white font-medium">
                  +{newCount.toLocaleString()} new trade
                  {newCount === 1 ? "" : "s"}
                </span>{" "}
                for {displayName(official.name)} from a 278-T posted to OGE on{" "}
                {formatDate(ogeFilingDate)} (ingested {formatDate(ingestedDate!)}).
              </>
            ) : (
              <>
                {displayName(official.name)}&rsquo;s page was updated on{" "}
                {formatDate(ingestedDate!)}, based on a 278-T filed with OGE on{" "}
                {formatDate(ogeFilingDate)}.
              </>
            )}
            {" "}Officials have 30 to 45 days to report each trade, so
            transaction dates can be earlier than the filing date.
          </span>
        </div>
      )}

      <header className="mt-6 mb-12 flex items-start gap-4">
        <OfficialAvatar
          name={official.name}
          slug={official.slug}
          party={official.party}
          size={72}
        />
        <div>
          <h1 className="font-[family-name:var(--font-source-serif)] text-4xl text-neutral-900 mb-2">
            {displayName(official.name)}
          </h1>
          <p className="text-neutral-500">
            {official.departedDate && (
              <span className="text-xs uppercase tracking-wider text-amber-700 font-medium mr-2">
                Former
              </span>
            )}
            {official.title} · {official.agency}
          </p>
        </div>
      </header>

      {official.summary && (
        <p className="text-sm text-neutral-600 leading-relaxed border-l-2 border-neutral-200 pl-4 mb-10">
          {official.summary}
        </p>
      )}

      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-neutral-500 border-b border-neutral-200 pb-6 mb-10">
        <div>
          <span className="text-lg font-semibold text-neutral-900 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1">
            {totalTrades}
          </span>
          trades
        </div>
        <div>
          <span className="text-lg font-semibold text-red-700 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1">
            {sells}
          </span>
          {sells === 1 ? "sale" : "sales"}
        </div>
        <div>
          <span className="text-lg font-semibold text-emerald-700 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1">
            {buys}
          </span>
          {buys === 1 ? "purchase" : "purchases"}
        </div>
        {lateFilings > 0 && (
          <div>
            <span className="text-lg font-semibold text-amber-700 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1">
              {lateFilings}
            </span>
            late {lateFilings === 1 ? "filing" : "filings"}
            {HIGH_VOLUME && totalTrades > 0 && (
              <span className="text-xs text-neutral-400 ml-1">
                ({Math.round((100 * lateFilings) / totalTrades)}%)
              </span>
            )}
          </div>
        )}
        {HIGH_VOLUME && (
          <>
            <div>
              <span className="text-lg font-semibold text-neutral-900 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1">
                {Math.round(tradesPerWeek)}
              </span>
              trades/week avg
            </div>
            {peakDay && peakDay[1] >= 50 && (
              <div>
                <span className="text-lg font-semibold text-neutral-900 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1">
                  {peakDay[1]}
                </span>
                trades on {formatDate(peakDay[0])}
              </div>
            )}
            {daysWithHundredPlus > 0 && (
              <div>
                <span className="text-lg font-semibold text-neutral-900 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1">
                  {daysWithHundredPlus}
                </span>
                day{daysWithHundredPlus === 1 ? "" : "s"} with 100+ trades
              </div>
            )}
          </>
        )}
        <div className="text-neutral-400">
          {formatDate(earliest.toISOString().split("T")[0])} –{" "}
          {formatDate(latest.toISOString().split("T")[0])}
        </div>
      </div>
      {HIGH_VOLUME && (
        <p className="text-xs text-neutral-400 -mt-8 mb-4">
          Trade-value totals (e.g. on the dashboard) sum the midpoints of OGE
          disclosure ranges, not exact amounts. Federal law requires only
          ranges. Treat all dollar estimates as range midpoints.
        </p>
      )}
      <p className="text-xs text-neutral-400 -mt-8 mb-10">
        Last filing: {formatDate(ogeFilingDate)}
        <span className="text-neutral-300 mx-1.5">|</span>
        Transactions: {formatDate(earliest.toISOString().split("T")[0])} – {formatDate(latest.toISOString().split("T")[0])}
      </p>

      {buys === 0 && sells > 0 && (
        <p className="text-xs text-neutral-400 mb-6">
          Every transaction on file is a sale. This is the pattern you would
          expect from an official liquidating positions to comply with an
          ethics agreement, but Open Cabinet does not yet ingest the
          entry-disclosure baseline (Nominee 278) needed to confirm which
          holdings have been fully divested.
        </p>
      )}
      {sells === 0 && buys > 0 && (
        <p className="text-xs text-neutral-400 mb-6">
          All transactions were purchases made while in office.
        </p>
      )}

      <section className="mb-6">
        <div className="flex items-baseline justify-between mb-3 gap-4 flex-wrap">
          <div>
            <h2 className="text-xs uppercase tracking-wider text-neutral-500">
              {chartView === "bars" ? "Trades by month" : "Transaction timeline"}
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              {chartView === "bars"
                ? "Click any month to zoom in. Sales above midline, purchases below. Amber tick = month with late-filed trades."
                : "One dot per disclosed trade, sized by amount. Red = sale, green = purchase."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {HIGH_VOLUME && <ViewToggle selected={chartView} />}
            <RangeFilter selected={range} />
          </div>
        </div>
        {chartView === "bars" ? (
          <MonthlyBars
            transactions={chartTransactions}
            selectedMonth={monthFilter}
            clickToZoom
          />
        ) : (
          <TransactionTimeline
            transactions={visibleTransactions}
            careerEvents={getCareerEvents(official)}
          />
        )}
      </section>

      <TransactionFilters
        type={typeFilter}
        monthKey={monthFilter}
        monthLabel={monthLabel}
        totalCount={transactions.length}
        filteredCount={visibleTransactions.length}
      />

      <div id="trades" className="scroll-mt-4">
        {tableNeedsPaging && (
          <Pagination
            page={page}
            totalPages={totalPages}
            perPage={TABLE_PAGE_SIZE}
            totalCount={visibleSorted.length}
            basePath={`/officials/${slug}`}
            searchParams={{
              range: range === "all" ? undefined : range,
              type: typeFilter === "all" ? undefined : typeFilter,
              month: monthFilter ?? undefined,
            }}
          />
        )}
      </div>
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-900 text-xs uppercase tracking-wider text-neutral-500">
              <th className="pb-2 pr-4 font-medium">Date</th>
              <th className="pb-2 pr-4 font-medium">Description</th>
              <th className="pb-2 pr-4 font-medium hidden sm:table-cell">
                Ticker
              </th>
              <th className="pb-2 pr-4 font-medium">Type</th>
              <th className="pb-2 pr-4 font-medium text-right">Amount</th>
              <th className="pb-2 font-medium text-right">Source</th>
            </tr>
          </thead>
          <tbody>
            {tableSlice.map((tx, i) => {
              const sourceFiling = getSourceFilingForTransaction(
                tx,
                official.sourceFilings
              );
              return (
              <tr
                key={`${tx.date}-${tx.description}-${i}`}
                className={`border-b border-neutral-100 ${
                  i % 2 === 1 ? "bg-neutral-50/60" : ""
                }`}
              >
                <td className="py-2.5 pr-4 tabular-nums text-neutral-500 whitespace-nowrap">
                  {formatDate(tx.date)}
                </td>
                <td className="py-2.5 pr-4 text-neutral-900">
                  {tx.description}
                  {tx.lateFilingFlag && (
                    <span className="ml-2 text-xs text-amber-700 font-medium uppercase">
                      Late
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-4 font-[family-name:var(--font-dm-mono)] text-neutral-500 hidden sm:table-cell">
                  {tx.ticker || "—"}
                </td>
                <td className="py-2.5 pr-4 whitespace-nowrap">
                  <span
                    className={
                      isSale(tx.type)
                        ? "text-red-700"
                        : tx.type === "Purchase"
                          ? "text-emerald-700"
                          : "text-neutral-600"
                    }
                  >
                    {tx.type}
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-right tabular-nums font-[family-name:var(--font-dm-mono)] text-neutral-600 whitespace-nowrap">
                  {amountRangeLabel(tx.amount)}
                </td>
                <td className="py-2.5 text-right whitespace-nowrap">
                  {sourceFiling ? (
                    <a
                      href={sourceFiling.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${sourceFiling.label} filed ${formatDate(sourceFiling.date)}`}
                      className="text-xs text-neutral-400 hover:text-neutral-900 underline underline-offset-2 decoration-neutral-200 hover:decoration-neutral-900"
                    >
                      PDF
                    </a>
                  ) : (
                    <span className="text-xs text-neutral-300">—</span>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {tableNeedsPaging && (
        <Pagination
          page={page}
          totalPages={totalPages}
          perPage={TABLE_PAGE_SIZE}
          totalCount={visibleSorted.length}
          basePath={`/officials/${slug}`}
          searchParams={{
            range: range === "all" ? undefined : range,
            type: typeFilter === "all" ? undefined : typeFilter,
            month: monthFilter ?? undefined,
          }}
        />
      )}

      {sourceDocs && <SourceDocuments data={sourceDocs} />}

      {divestiture && promiseEvidence && (
        <DivestitureLedger data={divestiture} evidence={promiseEvidence} />
      )}

      {news.length > 0 && (
        <section className="mt-12 bg-stone-50 -mx-4 px-4 py-8">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-1">
              In the News
            </h2>
            <p className="text-sm text-neutral-500 mb-1">
              Published reporting on {displayName(official.name)}{"'"}s financial
              disclosures from major outlets.
            </p>
            <p className="text-xs text-neutral-400 mb-6">
              AI-assisted search across major outlets.
            </p>
            <div className="space-y-4">
              {news.map((item, i) => (
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
                  </div>
                  <p className="text-neutral-500 mt-1">{item.relevance}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Source filings */}
      {official.sourceFilings && official.sourceFilings.length > 0 && (
        <section className="mt-12 border-t border-neutral-200 pt-8">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
            Source filings
          </h2>
          <p className="text-xs text-neutral-400 mb-3">
            Original PDFs from the U.S. Office of Government Ethics. These are
            the documents Open Cabinet parses.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {official.sourceFilings.map(
              (filing, i) => (
                <a
                  key={i}
                  href={filing.url}
                  className="border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 transition-colors flex items-center justify-between"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>
                    <span className="text-neutral-900 font-medium">
                      {filing.label}
                    </span>
                    <span className="text-neutral-400 ml-2">{filing.date}</span>
                  </span>
                  <span className="text-neutral-300 text-xs">PDF</span>
                </a>
              )
            )}
          </div>
        </section>
      )}

      <p className="text-xs text-neutral-400 mt-8">
        Source: U.S. Office of Government Ethics, {official.filingType}. Asset
        values and transaction amounts are reported in ranges as required by
        federal law.{" "}
        <a
          href="https://extapps2.oge.gov/201/Presiden.nsf"
          className="underline hover:text-neutral-600"
          target="_blank"
          rel="noopener noreferrer"
        >
          View original filings
        </a>
      </p>
    </div>
  );
}
