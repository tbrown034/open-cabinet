"use client";

/**
 * The question box.
 *
 * Everything a reader sees here is shown alongside how it was produced: the
 * plain-English restatement of the query that actually ran, the sentence, the
 * numbers, the rows with links to the filings, and the count of rows the
 * answer left out because a check has not agreed with them yet.
 */
import { useState } from "react";
import Link from "next/link";

interface ResultRow {
  officialName: string;
  officialSlug: string;
  agency: string;
  description: string;
  ticker: string | null;
  type: string;
  date: string;
  dateDisplay: string;
  amountLabel: string | null;
  lateFilingFlag: boolean;
  sourceUrl: string | null;
}

interface RankedOfficial {
  name: string;
  slug: string;
  count: number;
  estimateDisplay: string;
}

interface RankedAsset {
  ticker: string | null;
  label: string;
  count: number;
  estimateDisplay: string;
}

interface AskResult {
  aggregate: string;
  matchedRows: number;
  count?: number;
  totals?: {
    estimateDisplay: string;
    knownCount: number;
    unknownCount: number;
    openEndedCount: number;
  };
  rows?: ResultRow[];
  topOfficials?: RankedOfficial[];
  topAssets?: RankedAsset[];
  byMonth?: Array<{ month: string; count: number }>;
  lateShare?: { late: number; total: number; percent: number; display: string };
  firstDate?: string | null;
  lastDate?: string | null;
}

interface PendingCounts {
  underReview: number;
  auditPending: number;
  notYetCompared: number;
}

interface AskResponse {
  status: "answered" | "not_in_data" | "declined" | "error";
  answer: string;
  planText: string | null;
  result: AskResult | null;
  excluded:
    | (PendingCounts & { checked: number; parsed: number })
    | null;
  /** Rows matching THIS question that have not cleared a check. */
  pendingMatches?: PendingCounts;
  /** The one-line note for those, written in code. */
  pendingNote?: string | null;
  disclosure: string;
}

// Questions the verified rows can actually answer. Picked against the
// published set, not invented, so the first thing a reader clicks returns
// something rather than an empty result.
/** Filing text carries em dashes too, and the site does not print them. */
function cleanDashes(text: string): string {
  return text.replace(/\s*(?:[—–―]|--)\s*/g, ", ").replace(/\s+/g, " ").trim();
}

const GENERAL_SUGGESTIONS = [
  "How many checked trades does Christopher Wright have?",
  "Which officials sold Liberty Energy?",
  "Trades flagged late in 2026",
  "What percentage of checked trades were filed late?",
];

export default function AskTheData({
  officialSlug,
  officialName,
  checkedCount = null,
  parsedCount = null,
}: {
  officialSlug?: string;
  officialName?: string;
  /** Both computed from the verification file on the server, never hardcoded. */
  checkedCount?: number | null;
  parsedCount?: number | null;
}) {
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [response, setResponse] = useState<AskResponse | null>(null);

  // "On file" is the completeness claim the answer checker bans, so a chip
  // must not ask a question the box is forbidden to answer honestly.
  const suggestions = officialName
    ? [
        `How many checked trades does ${officialName} have?`,
        `What was sold in 2025?`,
        `Which trades were flagged late?`,
        `Largest sales by disclosed range`,
      ]
    : GENERAL_SUGGESTIONS;

  async function ask(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 3 || pending) return;
    setPending(true);
    setResponse(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, officialSlug }),
      });
      setResponse((await res.json()) as AskResponse);
    } catch {
      setResponse({
        status: "error",
        answer: "The question could not be sent. Check your connection and try again.",
        planText: null,
        result: null,
        excluded: null,
        disclosure: "",
      });
    } finally {
      setPending(false);
    }
  }

  const result = response?.result ?? null;

  return (
    <section className="border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-5 py-4">
        <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900">
          Ask the data
        </h2>
        <p className="text-xs text-neutral-500 mt-1 max-w-2xl leading-relaxed">
          Ask in plain English{officialName ? ` about ${officialName}` : ""}. Code runs the
          query and produces every number. AI only writes the question into a query and, if it
          passes a check, the sentence. This box answers only from checked rows: rows that an
          independent program or a second company{"'"}s model agreed with and a third
          company{"'"}s model confirmed against the page image.
          {checkedCount !== null && parsedCount !== null && (
            <>
              {" "}That is {checkedCount.toLocaleString()} of {parsedCount.toLocaleString()}{" "}
              parsed rows. It is not the full record.
            </>
          )}
        </p>
      </div>

      <div className="px-5 py-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={300}
            placeholder={
              officialName
                ? `Ask about ${officialName}'s disclosures`
                : "Ask about officials, symbols, dates or late filings"
            }
            className="flex-1 border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900"
            aria-label="Your question about the disclosure data"
          />
          <button
            type="submit"
            disabled={pending || question.trim().length < 3}
            className="bg-neutral-900 text-white text-sm font-medium px-5 py-2 hover:bg-neutral-700 disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? "Running" : "Ask"}
          </button>
        </form>

        <div className="flex flex-wrap gap-2 mt-3">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQuestion(s);
                ask(s);
              }}
              disabled={pending}
              className="border border-neutral-200 bg-stone-50 text-xs text-neutral-600 px-2.5 py-1 hover:border-neutral-900 hover:text-neutral-900 disabled:opacity-50 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {response && (
        <div className="border-t border-neutral-200 px-5 py-4">
          {response.planText && (
            <p className="text-xs uppercase tracking-wider text-neutral-400 mb-1">
              Query that ran
            </p>
          )}
          {response.planText && (
            <p className="text-sm text-neutral-600 font-[family-name:var(--font-dm-mono)] mb-4">
              {response.planText}
            </p>
          )}

          <p className="text-base text-neutral-900 leading-relaxed">{response.answer}</p>

          {response.status === "not_in_data" && response.pendingNote && (
            <p className="text-sm text-neutral-500 mt-3 border-l-2 border-amber-400 pl-3">
              Those rows are on the site and open to read. They are not answered from here
              until a check clears them.
            </p>
          )}

          {result?.totals && (
            <div className="mt-4 border border-neutral-200">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-neutral-100">
                    <td className="px-3 py-2 text-neutral-500">Estimated value</td>
                    <td className="px-3 py-2 text-right font-[family-name:var(--font-dm-mono)] tabular-nums text-neutral-900">
                      {result.totals.estimateDisplay}
                    </td>
                  </tr>
                  <tr className="border-b border-neutral-100">
                    <td className="px-3 py-2 text-neutral-500">Rows with a disclosed range</td>
                    <td className="px-3 py-2 text-right font-[family-name:var(--font-dm-mono)] tabular-nums text-neutral-900">
                      {result.totals.knownCount.toLocaleString()}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-neutral-500">
                      Rows with no stated value, excluded from the total
                    </td>
                    <td className="px-3 py-2 text-right font-[family-name:var(--font-dm-mono)] tabular-nums text-neutral-900">
                      {result.totals.unknownCount.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {result?.lateShare && result.lateShare.total > 0 && (
            <div className="mt-4 border border-neutral-200">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-neutral-100">
                    <td className="px-3 py-2 text-neutral-500">Flagged late</td>
                    <td className="px-3 py-2 text-right font-[family-name:var(--font-dm-mono)] tabular-nums text-amber-700">
                      {result.lateShare.late.toLocaleString()}
                    </td>
                  </tr>
                  <tr className="border-b border-neutral-100">
                    <td className="px-3 py-2 text-neutral-500">Verified rows in the query</td>
                    <td className="px-3 py-2 text-right font-[family-name:var(--font-dm-mono)] tabular-nums text-neutral-900">
                      {result.lateShare.total.toLocaleString()}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-neutral-500">Share</td>
                    <td className="px-3 py-2 text-right font-[family-name:var(--font-dm-mono)] tabular-nums text-neutral-900">
                      {result.lateShare.percent}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {result?.topOfficials && result.topOfficials.length > 0 && (
            <ul className="mt-4 divide-y divide-neutral-100 border border-neutral-200">
              {result.topOfficials.map((o) => (
                <li key={o.slug} className="flex justify-between gap-4 px-3 py-2 text-sm">
                  <Link href={`/officials/${o.slug}`} className="text-neutral-900 underline hover:text-neutral-600">
                    {o.name}
                  </Link>
                  <span className="text-neutral-500 font-[family-name:var(--font-dm-mono)] tabular-nums shrink-0">
                    {o.count.toLocaleString()} rows · {o.estimateDisplay}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {result?.topAssets && result.topAssets.length > 0 && (
            <ul className="mt-4 divide-y divide-neutral-100 border border-neutral-200">
              {result.topAssets.map((a) => (
                <li key={a.label} className="flex justify-between gap-4 px-3 py-2 text-sm">
                  <span className="text-neutral-900">{a.label}</span>
                  <span className="text-neutral-500 font-[family-name:var(--font-dm-mono)] tabular-nums shrink-0">
                    {a.count.toLocaleString()} rows · {a.estimateDisplay}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {result?.byMonth && result.byMonth.length > 0 && (
            <ul className="mt-4 divide-y divide-neutral-100 border border-neutral-200">
              {result.byMonth.map((m) => (
                <li key={m.month} className="flex justify-between gap-4 px-3 py-2 text-sm">
                  <span className="text-neutral-600 font-[family-name:var(--font-dm-mono)]">{m.month}</span>
                  <span className="text-neutral-900 font-[family-name:var(--font-dm-mono)] tabular-nums">
                    {m.count.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {result?.rows && result.rows.length > 0 && (
            <div className="mt-4 overflow-x-auto border border-neutral-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-neutral-400 border-b border-neutral-200">
                    <th className="px-3 py-2 font-normal">Official</th>
                    <th className="px-3 py-2 font-normal">Asset</th>
                    <th className="px-3 py-2 font-normal">Type</th>
                    <th className="px-3 py-2 font-normal">Date</th>
                    <th className="px-3 py-2 font-normal">Range</th>
                    <th className="px-3 py-2 font-normal">Filing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {result.rows.map((row, i) => (
                    <tr key={`${row.officialSlug}-${row.date}-${i}`}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link
                          href={`/officials/${row.officialSlug}`}
                          className="text-neutral-900 underline hover:text-neutral-600"
                        >
                          {row.officialName}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-neutral-600">
                        {row.ticker ? `${row.ticker} · ` : ""}
                        {cleanDashes(row.description)}
                      </td>
                      <td className="px-3 py-2 text-neutral-600 whitespace-nowrap">
                        {row.type}
                        {row.lateFilingFlag && (
                          <span className="ml-1.5 text-amber-700 text-xs uppercase tracking-wider">
                            Late
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-neutral-600 whitespace-nowrap">
                        {row.dateDisplay}
                      </td>
                      <td className="px-3 py-2 text-neutral-600 font-[family-name:var(--font-dm-mono)] tabular-nums whitespace-nowrap">
                        {row.amountLabel ?? "Not stated"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {row.sourceUrl ? (
                          <a
                            href={row.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-neutral-500 underline hover:text-neutral-900"
                          >
                            278-T
                          </a>
                        ) : (
                          <span className="text-neutral-300">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {response.pendingNote && (
            <p className="text-xs text-neutral-600 mt-4">{response.pendingNote}</p>
          )}

          {response.excluded && (
            <p className="text-xs text-neutral-500 mt-2">
              Across the site, {response.excluded.underReview.toLocaleString()} rows are
              under review, {response.excluded.auditPending.toLocaleString()} are awaiting
              the page audit and {response.excluded.notYetCompared.toLocaleString()} are not
              yet compared. They are not in this box.{" "}
              <Link href="/methodology" className="underline hover:text-neutral-900">
                How rows get checked
              </Link>
            </p>
          )}

          {response.disclosure && (
            <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
              {response.disclosure}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
