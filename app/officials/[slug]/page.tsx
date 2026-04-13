import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getOfficialBySlug, getAllOfficialSlugs } from "@/lib/data";
import { formatDate, amountRangeLabel, displayName } from "@/lib/format";
import { getNewsForOfficial } from "@/lib/news";
import type { Transaction } from "@/lib/types";
import TransactionTimeline from "@/app/components/transaction-timeline";
import OfficialAvatar from "@/app/components/official-avatar";

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

export default async function OfficialPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const official = await getOfficialBySlug(slug);

  if (!official) {
    notFound();
  }

  const news = await getNewsForOfficial(slug);
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <Link
        href="/"
        className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
      >
        ← Back to directory
      </Link>

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
          </div>
        )}
        <div className="text-neutral-400">
          {formatDate(earliest.toISOString().split("T")[0])} –{" "}
          {formatDate(latest.toISOString().split("T")[0])}
        </div>
      </div>
      <p className="text-xs text-neutral-400 -mt-8 mb-10">
        Last filing: {formatDate(latest.toISOString().split("T")[0])}
      </p>

      {buys === 0 && sells > 0 && (
        <p className="text-xs text-neutral-400 mb-6">
          All transactions were sales — consistent with ethics agreement
          divestitures upon entering government service.
        </p>
      )}
      {sells === 0 && buys > 0 && (
        <p className="text-xs text-neutral-400 mb-6">
          All transactions were purchases made while in office.
        </p>
      )}

      <TransactionTimeline
        transactions={transactions}
        careerEvents={(() => {
          const events: Array<{ date: string; label: string; style: "solid" | "dashed" | "dotted"; color: string }> = [];
          const confirmDate = official.confirmedDate || official.tookOfficeDate;
          if (confirmDate) {
            events.push({
              date: confirmDate,
              label: official.tookOfficeDate ? "Took office" : "Confirmed",
              style: "solid",
              color: "#a3a3a3",
            });
            // 90-day deadline (President is exempt)
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
            const diff = Math.abs(new Date(official.ethicsAgreementDate).getTime() - new Date(confirmDate).getTime());
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
        })()}
      />

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
              <th className="pb-2 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((tx, i) => (
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
                <td className="py-2.5 text-right tabular-nums font-[family-name:var(--font-dm-mono)] text-neutral-600 whitespace-nowrap">
                  {amountRangeLabel(tx.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
              AI-assisted search. Last updated{" "}
              {new Date().toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}.
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
      {(official as any).sourceFilings?.length > 0 && (
        <section className="mt-12 border-t border-neutral-200 pt-8">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
            Source filings
          </h2>
          <p className="text-xs text-neutral-400 mb-3">
            Original PDFs from the U.S. Office of Government Ethics. These are
            the documents Open Cabinet parses.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(official as any).sourceFilings.map(
              (filing: { date: string; url: string; label: string }, i: number) => (
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
