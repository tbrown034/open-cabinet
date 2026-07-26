import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { displayName, formatDate } from "@/lib/format";
import { officeLine } from "@/lib/office-line";
import { showTicker } from "@/lib/emails";
import { getPublicUpdate, getPublicUpdates } from "@/lib/updates";

function isSale(type: string): boolean {
  return type.startsWith("Sale");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  const update = await getPublicUpdate(date);
  if (!update) return { title: "Not Found" };

  const names = update.items.map((i) => displayName(i.name));
  const who =
    names.length <= 3
      ? names.join(", ")
      : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;

  return {
    title: `New Stock Filings ${formatDate(date)}: ${who}`,
    description: `${update.tradeCount.toLocaleString()} newly disclosed trades from ${update.officialCount} executive branch official${update.officialCount === 1 ? "" : "s"}, reported to the U.S. Office of Government Ethics.`,
    alternates: { canonical: `https://open-cabinet.org/filings/${date}` },
  };
}

/** Every committed entry is prerendered at build time. */
export async function generateStaticParams() {
  const updates = await getPublicUpdates();
  return updates.map((u) => ({ date: u.date }));
}

export default async function FilingUpdatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const update = await getPublicUpdate(date);
  if (!update) notFound();

  const ledeParas = update.lede
    ? update.lede.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link
        href="/filings"
        className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
      >
        ← All filing updates
      </Link>

      <div className="mt-6 text-xs uppercase tracking-wider text-neutral-500">
        {formatDate(update.date)}
      </div>
      <h1 className="font-[family-name:var(--font-source-serif)] text-4xl text-neutral-900 mt-2 mb-4 leading-tight">
        {update.officialCount} official{update.officialCount === 1 ? "" : "s"}{" "}
        reported {update.tradeCount.toLocaleString()} new trade
        {update.tradeCount === 1 ? "" : "s"}
      </h1>

      {ledeParas.length > 0 && (
        <div className="border-b border-neutral-200 pb-6 mb-8">
          {ledeParas.map((p, i) => (
            <p
              key={i}
              className={`text-neutral-800 leading-relaxed ${i > 0 ? "mt-4" : ""}`}
            >
              {p}
            </p>
          ))}
        </div>
      )}

      {update.items.map((item) => (
        <section key={item.slug} className="mb-10">
          <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900">
            <Link href={`/officials/${item.slug}`} className="hover:underline">
              {displayName(item.name)}
            </Link>
          </h2>
          <p className="text-xs text-neutral-500 mt-1 mb-3">
            {officeLine(item.title, item.agency)} ·{" "}
            {item.newCount.toLocaleString()} new trade
            {item.newCount === 1 ? "" : "s"}
          </p>

          <table className="w-full text-left text-sm border-t border-neutral-200">
            <tbody>
              {item.trades.map((t, i) => (
                <tr key={i} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 text-neutral-900">
                    {t.description}
                    {/* Many descriptions already carry the ticker, so
                        appending it produced "Okta, Inc. (OKTA) (OKTA)". */}
                    {showTicker(t) ? ` (${t.ticker})` : ""}
                    {t.lateFilingFlag && (
                      <span className="ml-1.5 bg-amber-200 text-amber-950 text-[10px] uppercase tracking-wider px-1 py-0.5">
                        Late
                      </span>
                    )}
                  </td>
                  <td
                    className={`py-2 pr-4 whitespace-nowrap ${isSale(t.type) ? "text-red-700" : "text-emerald-700"}`}
                  >
                    {t.type}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap tabular-nums font-[family-name:var(--font-dm-mono)] text-neutral-900">
                    {t.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {item.trades.length < item.newCount && (
            <p className="text-xs text-neutral-500 mt-2">
              Showing {item.trades.length} of{" "}
              {item.newCount.toLocaleString()} new trades.
            </p>
          )}

          <p className="text-sm mt-3">
            <Link
              href={`/officials/${item.slug}`}
              className="text-neutral-900 underline underline-offset-4"
            >
              Full record
            </Link>
            {item.primaryFilingUrl && (
              <>
                {" · "}
                <a
                  href={item.primaryFilingUrl}
                  className="text-neutral-500 underline underline-offset-4"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  OGE filing (PDF)
                </a>
              </>
            )}
          </p>
        </section>
      ))}

      {update.alsoNew.length > 0 && (
        <div className="border-t border-neutral-200 pt-6">
          <div className="text-xs uppercase tracking-wider text-neutral-500 mb-3">
            Also filed around this time
          </div>
          <ul className="text-sm text-neutral-500 space-y-1">
            {update.alsoNew.map((o) => (
              <li key={o.slug}>
                <Link
                  href={`/officials/${o.slug}`}
                  className="underline hover:text-neutral-900"
                >
                  {displayName(o.name)}
                </Link>
                {o.newTradeCount
                  ? ` — ${o.newTradeCount.toLocaleString()} new trade${o.newTradeCount === 1 ? "" : "s"},`
                  : " —"}{" "}
                posted {formatDate(o.postedDate)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-neutral-200 mt-10 pt-6">
        <p className="text-sm text-neutral-600">
          Get these by email when they post.{" "}
          <Link href="/#alerts" className="underline hover:text-neutral-900">
            Subscribe
          </Link>
          .
        </p>
        <p className="text-xs text-neutral-400 mt-3">
          Source: U.S. Office of Government Ethics. Amounts are reported in
          ranges, as federal law requires. A late flag means the official
          certified knowing about the trade more than 30 days before reporting
          it.
        </p>
      </div>
    </div>
  );
}
