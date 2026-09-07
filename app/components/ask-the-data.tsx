"use client";

/**
 * The question box.
 *
 * Everything a reader sees here is shown alongside how it was produced: the
 * plain-English restatement of the query that actually ran, the sentence, the
 * numbers, the rows with links to the filings, and the count of rows the
 * answer left out because a check has not agreed with them yet.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Honest wait status. There is no streaming from the route, so the stages
 * are time-based and worded as what the route does in order: the code
 * gate, the one model call, the count. Never a stage the route is not in.
 */
function PendingStatus() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const stages: Array<[string, boolean]> = [
    ["Reading the question", true],
    ["Turning it into a query", seconds >= 1],
    ["Counting checked rows", seconds >= 6],
  ];
  return (
    <div className="px-5 py-4 border-t border-neutral-200" role="status" aria-live="polite">
      {stages.map(([label, reached], i) => {
        const current = reached && (i === stages.length - 1 || !stages[i + 1][1]);
        return (
          <p key={label} className={`flex items-center gap-2 text-sm ${reached ? "text-neutral-700" : "text-neutral-300"} mt-0.5 first:mt-0`}>
            {current ? (
              <span className="size-2 animate-pulse rounded-full bg-neutral-500" aria-hidden />
            ) : reached ? (
              <span className="size-2 rounded-full bg-neutral-300" aria-hidden />
            ) : (
              <span className="size-2 rounded-full border border-neutral-200" aria-hidden />
            )}
            <span>{label}{current ? "..." : ""}</span>
          </p>
        );
      })}
      {seconds >= 12 && <p className="text-xs text-neutral-400 mt-2">Still working ({seconds}s). The model call stops at 10 seconds; the count is quick.</p>}
    </div>
  );
}

const STATUS_LABEL: Record<AskResponse["status"], { text: string; className: string }> = {
  answered: { text: "Answered from checked rows", className: "border-emerald-700 text-emerald-800" },
  not_in_data: { text: "Not in this data", className: "border-neutral-400 text-neutral-600" },
  declined: { text: "Declined", className: "border-amber-700 text-amber-800" },
  error: { text: "Error", className: "border-red-700 text-red-800" },
};

/** The template repeats the query restatement first; the card shows the query once, on its own line. */
function sentenceWithoutQuery(answer: string, planText: string | null): string {
  if (planText && answer.startsWith(planText)) return answer.slice(planText.length).trim();
  return answer;
}

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
  /** The validated plan the executor ran (builder view). */
  plan?: unknown;
  /** Where the plan came from: the model, a stored plan for the same question, or a follow-up chip. */
  planSource?: "model" | "cache" | "follow-up";
  /** The log row for this answer, so feedback can attach to it. */
  logId?: number | null;
  /** Code-built variations of the plan that ran; each needs no model call. */
  followUps?: Array<{ label: string; plan: unknown }>;
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
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  // Builder view: the machinery under the answer. Off for readers; a person
  // building or explaining the box turns it on, and the choice sticks.
  const [builder, setBuilder] = useState(false);
  useEffect(() => {
    try { setBuilder(localStorage.getItem("askai-builder") === "1"); } catch {}
  }, []);
  function toggleBuilder() {
    setBuilder((b) => { try { localStorage.setItem("askai-builder", b ? "0" : "1"); } catch {} return !b; });
  }

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

  const abortRef = useRef<AbortController | null>(null);
  const answerRef = useRef<HTMLDivElement | null>(null);
  const [feedback, setFeedback] = useState<"right" | "wrong" | "sent" | null>(null);
  const [feedbackReason, setFeedbackReason] = useState("");

  /** Ask a question, or run a code-built follow-up plan (no model call). */
  async function ask(text: string, plan?: unknown) {
    const trimmed = text.trim();
    if (trimmed.length < 3 || pending) return;
    setPending(true);
    setResponse(null);
    setElapsedMs(null);
    setFeedback(null);
    setFeedbackReason("");
    const controller = new AbortController();
    abortRef.current = controller;
    const t0 = Date.now();
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan ? { question: trimmed, officialSlug, plan } : { question: trimmed, officialSlug }),
        signal: controller.signal,
      });
      setResponse((await res.json()) as AskResponse);
      setElapsedMs(Date.now() - t0);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        setResponse(null);
      } else {
        setResponse({
          status: "error",
          answer: "The question could not be sent. Check your connection and try again.",
          planText: null,
          result: null,
          excluded: null,
          disclosure: "",
        });
      }
    } finally {
      abortRef.current = null;
      setPending(false);
    }
  }

  // Move focus to the answer when it lands, so a keyboard or screen-reader
  // user is taken to it instead of left at the input.
  useEffect(() => {
    if (response && answerRef.current) answerRef.current.focus();
  }, [response]);

  async function sendFeedback(verdict: "right" | "wrong") {
    if (!response?.logId) return;
    setFeedback(verdict);
    if (verdict === "right") {
      await fetch("/api/ask/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logId: response.logId, verdict }) }).catch(() => undefined);
      setFeedback("sent");
    }
  }

  async function sendWrongReason() {
    if (!response?.logId) return;
    await fetch("/api/ask/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logId: response.logId, verdict: "wrong", reason: feedbackReason }) }).catch(() => undefined);
    setFeedback("sent");
  }

  const result = response?.result ?? null;

  return (
    <section className="border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-5 py-4">
        <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900">
          Ask the data
        </h2>
        <p className="text-sm text-neutral-500 mt-1 max-w-2xl leading-relaxed">
          Ask in plain English{officialName ? ` about ${officialName}` : ""}. The AI only turns your question into a
          query; code runs it over checked rows and writes the answer.
          {checkedCount !== null && parsedCount !== null && (
            <> {checkedCount.toLocaleString()} of {parsedCount.toLocaleString()} parsed rows qualify today.</>
          )}
        </p>
        <div className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2 text-xs text-neutral-500 max-w-2xl">
          <p>
            <span className="text-neutral-700 font-medium">It can answer:</span>{" "}who traded a company, an official&apos;s
            sales or purchases, a date range, trades flagged late, totals by disclosed range, bonds or ETFs as a kind of asset.
          </p>
          <p>
            <span className="text-neutral-700 font-medium">It cannot answer:</span> what a trade earned or lost, best or worst
            trades, current holdings or net worth, prices, motives or legality. Filings give dollar ranges, not prices.
          </p>
        </div>
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

      {pending && (
        <div className="relative">
          <PendingStatus />
          <button type="button" onClick={() => abortRef.current?.abort()} className="absolute right-5 top-4 text-xs text-neutral-400 underline hover:text-neutral-900">
            Cancel
          </button>
        </div>
      )}

      {response && !pending && (
        <div ref={answerRef} tabIndex={-1} className="border-t border-neutral-200 px-5 py-4 outline-none">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className={`inline-block border text-[11px] uppercase tracking-wider px-2 py-0.5 ${STATUS_LABEL[response.status].className}`}>
              {STATUS_LABEL[response.status].text}
            </span>
            <button type="button" onClick={toggleBuilder} className="text-xs text-neutral-400 underline hover:text-neutral-900">
              {builder ? "Hide the machinery" : "Show the machinery"}
            </button>
          </div>

          <p className="font-[family-name:var(--font-source-serif)] text-xl text-neutral-900 leading-snug">
            {sentenceWithoutQuery(response.answer, response.planText)}
          </p>
          {response.planText && (
            <p className="text-xs text-neutral-500 mt-2">
              <span className="uppercase tracking-wider text-neutral-400 mr-2">Query</span>
              <span>{response.planText}</span>
              {response.planSource === "cache" && <span className="ml-2 text-neutral-400">(stored translation, re-run on today&apos;s rows)</span>}
              {response.planSource === "follow-up" && <span className="ml-2 text-neutral-400">(follow-up, no model call)</span>}
            </p>
          )}

          {response.followUps && response.followUps.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {response.followUps.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => ask(`${question || "Follow-up"}: ${f.label}`, f.plan)}
                  className="border border-neutral-200 text-xs text-neutral-600 px-2.5 py-1 hover:border-neutral-900 hover:text-neutral-900 transition-colors"
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

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
                        {row.ticker ? (
                          <>
                            <Link href={`/companies/${row.ticker.toLowerCase()}`} className="font-[family-name:var(--font-dm-mono)] text-neutral-900 underline hover:text-neutral-600">{row.ticker}</Link>
                            {" · "}
                          </>
                        ) : null}
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

          {response.excluded && (response.excluded.underReview + response.excluded.auditPending + response.excluded.notYetCompared > 0) && (
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

          {response.logId && response.status === "answered" && (
            <div className="mt-4 text-xs text-neutral-500 flex flex-wrap items-center gap-2">
              {feedback === "sent" ? (
                <span>Thanks. Your note is attached to this answer in the log.</span>
              ) : feedback === "wrong" ? (
                <>
                  <input value={feedbackReason} onChange={(e) => setFeedbackReason(e.target.value)} maxLength={500} placeholder="What was wrong? (optional)" className="border border-neutral-300 px-2 py-1 text-xs w-64" aria-label="What was wrong" />
                  <button type="button" onClick={sendWrongReason} className="border border-neutral-900 px-2 py-1 hover:bg-neutral-900 hover:text-white">Send</button>
                </>
              ) : (
                <>
                  <span>Was this answer right?</span>
                  <button type="button" onClick={() => sendFeedback("right")} className="border border-neutral-300 px-2 py-0.5 hover:border-neutral-900">Yes</button>
                  <button type="button" onClick={() => sendFeedback("wrong")} className="border border-neutral-300 px-2 py-0.5 hover:border-neutral-900">No</button>
                </>
              )}
            </div>
          )}

          {response.disclosure && (
            <details className="mt-4 text-xs text-neutral-500">
              <summary className="cursor-pointer text-neutral-500 hover:text-neutral-900">How this answer was made</summary>
              <p className="mt-2 leading-relaxed">{response.disclosure}</p>
            </details>
          )}

          {builder && (
            <div className="mt-4 border border-dashed border-neutral-300 bg-stone-50 p-3 text-xs text-neutral-700">
              <p className="uppercase tracking-wider text-neutral-400 mb-2">Builder view: what the code did</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-neutral-400">Outcome</dt><dd>{response.status}</dd>
                <dt className="text-neutral-400">Round trip</dt><dd>{elapsedMs !== null ? `${(elapsedMs / 1000).toFixed(1)}s` : "n/a"}</dd>
                <dt className="text-neutral-400">Rows matched</dt><dd>{result ? result.matchedRows.toLocaleString() : "n/a"}</dd>
                <dt className="text-neutral-400">Aggregate</dt><dd>{result?.aggregate ?? "n/a"}</dd>
                <dt className="text-neutral-400">Plan from</dt><dd>{response.planSource ?? "n/a"}</dd>
                <dt className="text-neutral-400">Sentence by</dt><dd>code template (model prose is off in this alpha)</dd>
              </dl>
              <p className="uppercase tracking-wider text-neutral-400 mt-3 mb-1">Validated plan the executor ran</p>
              <pre className="overflow-x-auto font-[family-name:var(--font-dm-mono)] text-[11px] leading-relaxed whitespace-pre-wrap">{response.plan ? JSON.stringify(response.plan, null, 2) : "(no plan: the question was declined or not translated before execution)"}</pre>
              {response.excluded && (
                <p className="mt-2 text-neutral-500">Site-wide rows outside the box: {response.excluded.underReview} under review, {response.excluded.auditPending} awaiting audit, {response.excluded.notYetCompared} not compared, of {response.excluded.parsed.toLocaleString()} parsed.</p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
