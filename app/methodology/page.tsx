import type { Metadata } from "next";
import Link from "next/link";
import AboutScrolly from "../components/about-scrolly";
import PipelineFlow from "../components/pipeline-flow";
import { getAllOfficials, getOfficialBySlug, getOfficialsIndex } from "@/lib/data";
import { readCrosscheckLog, summarizeCrosscheckLog } from "@/lib/crosscheck-log";
import { sumAmountEstimates } from "@/lib/amounts";
import { readRowVerification } from "@/lib/row-verification";
import { readAssetResolution } from "@/lib/asset-resolution";
import { getTradesByTicker } from "@/lib/data";
import VerificationSummary from "../components/verification-summary";

const fmt = (n: number) => n.toLocaleString("en-US");
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

export const metadata: Metadata = {
  alternates: { canonical: "/methodology" },
  title: "Methodology",
  description:
    "How Open Cabinet collects, parses and verifies executive branch financial disclosures: the pipeline, the checks, and the known limitations.",
};

export default async function MethodologyPage() {
  const [currentOfficials, trump, index] = await Promise.all([
    getAllOfficials(),
    getOfficialBySlug("trump-donald-j"),
    getOfficialsIndex(),
  ]);
  const totalOfficials = index.officials.length;
  const currentOfficialCount = currentOfficials.length;
  const currentTransactions = currentOfficials.reduce(
    (sum, official) => sum + official.transactions.length,
    0
  );
  const currentLateTransactions = currentOfficials.reduce(
    (sum, official) =>
      sum + official.transactions.filter((tx) => tx.lateFilingFlag).length,
    0
  );
  const trumpTransactions = trump?.transactions.length ?? 0;

  // What the deterministic lane has actually compared, from the log the
  // ingest and the sweep write. Rendered as numbers so this page cannot
  // drift from the code the way an earlier sentence here did.
  // Every official in the index, former ones included: the log covers all
  // published filings, so the denominator must too.
  const everyOfficial = (
    await Promise.all(index.officials.map((o) => getOfficialBySlug(o.slug)))
  ).filter((o) => o !== null);
  const allRows = everyOfficial.flatMap((o) => o.transactions);
  const log = readCrosscheckLog();
  const rowVerification = readRowVerification();
  const assets = readAssetResolution();
  const assetTiers = assets?.summary.byTier ?? {};
  const stockRows = (assetTiers.T1 ?? 0) + (assetTiers.T2 ?? 0) + (assetTiers.none ?? 0);
  // What actually reaches company pages: T1 plus the name gate plus the
  // current roster, counted by the same loader the pages use.
  const onCompanyPages = [...(await getTradesByTicker()).values()].reduce((n, c) => n + c.trades.length, 0);
  const coverage = log ? summarizeCrosscheckLog(log, allRows) : null;
  const agreedRows = coverage?.rows.checked_tuple_agreement ?? 0;
  const mismatchRows = coverage?.rows.checked_tuple_mismatch ?? 0;
  const scanRows = coverage?.rows.no_usable_text ?? 0;
  const layoutRows =
    (coverage?.rows.unsupported_layout ?? 0) + (coverage?.rows.unsupported_form ?? 0);
  const ocrFilings =
    (coverage?.filings.ocr_tuple_agreement ?? 0) + (coverage?.filings.ocr_tuple_mismatch ?? 0);
  const totals = sumAmountEstimates(allRows);
  const openEnded = sumAmountEstimates(
    allRows.filter((t) => t.amount === "Over $50,000,000" || t.amount === "Over $1,000,000")
  );
  const trumpLateTransactions =
    trump?.transactions.filter((tx) => tx.lateFilingFlag).length ?? 0;
  const nonTrumpLateTransactions =
    currentLateTransactions - trumpLateTransactions;

  return (
    <div>
      {/* Hero */}
      <div className="mx-auto max-w-3xl px-4 pt-16 pb-12">
        <h1 className="font-[family-name:var(--font-source-serif)] text-4xl md:text-5xl text-neutral-900 mb-4 leading-tight">
          Methodology
        </h1>
        <p className="text-neutral-500 max-w-xl leading-relaxed">
          How we collect, parse and verify executive branch financial
          disclosures. The law behind them is on the <Link href="/about#the-law" className="underline hover:text-neutral-900">About page</Link>.
        </p>
      </div>

      {/* What we add, and what we don't */}
      <div id="what-we-add" className="mx-auto max-w-3xl px-4 pb-16 scroll-mt-24">
        <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-4">
          What we add, and what we don{"'"}t
        </h2>
        <p className="text-neutral-600 leading-relaxed mb-4">
          Senior executive branch officials file three different financial
          disclosure documents with the Office of Government Ethics. Open
          Cabinet imports one of them today, and is in the process of adding a
          second.
        </p>
        <ul className="space-y-3 text-neutral-600 leading-relaxed mb-4">
          <li>
            <strong className="text-neutral-900">OGE Form 278-T (Periodic Transaction Report).</strong>{" "}
            Filed within 30 to 45 days of any individual-security transaction
            over $1,000. This is what powers the trades, dollar volume and
            late-filing counts on this site.
          </li>
          <li>
            <strong className="text-neutral-900">OGE Form 278 (Nominee/Entry Report).</strong>{" "}
            Filed once, before Senate confirmation, listing every asset the
            official held going in. This is the baseline against which
            divestitures should be measured. Adding Nominee 278 data is in
            progress; until it is complete, this site cannot tell you whether
            an official has fully divested a holding &mdash; only what they
            have traded.
          </li>
          <li>
            <strong className="text-neutral-900">OGE Form 278e (Annual Report).</strong>{" "}
            Filed every May 15 by every covered official, restating holdings
            and transactions for the prior year. Open Cabinet will add annual
            reports as they become available in public, downloadable form.
          </li>
        </ul>
        <p className="text-neutral-600 leading-relaxed">
          Until Nominee 278 data is in, statements like &ldquo;consistent with
          ethics agreement divestitures&rdquo; are not something this site can
          support from data alone &mdash; only from a side-by-side reading of
          the ethics agreement and the trades on file.
        </p>
      </div>

      {/* The pipeline on one page */}
      <div id="pipeline" className="mx-auto max-w-3xl px-4 pb-8 scroll-mt-24">
        <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-2">
          How a filing becomes published rows
        </h2>
        <p className="text-neutral-600 leading-relaxed">
          One diagram: what a program does, what a model does, and where a person is required.
        </p>
        <PipelineFlow />
      </div>

      {/* How this was built (the law and its deadlines live on About) */}
      <AboutScrolly part="build" />

      {/* Static sections */}
      <div className="mx-auto max-w-3xl px-4 py-16 space-y-12">
        {/* Known limitations */}
        <section id="known-limitations" className="scroll-mt-24">
          <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-4">
            Known limitations
          </h2>
          <ul className="space-y-3 text-sm text-neutral-600">
            <li>
              <strong className="text-neutral-900">
                Ranges, not exact amounts.
              </strong>{" "}
              All dollar values are reported in statutory ranges. A transaction
              listed as $1,001 to $15,000 could be worth $1,002 or $14,999.
            </li>
            <li>
              <strong className="text-neutral-900">
                Two ranges have no upper bound, and they carry a large share of the estimate.
              </strong>{" "}
              &ldquo;Over $50,000,000&rdquo; is valued at $75 million and
              &ldquo;Over $1,000,000&rdquo; (used for spouse- and
              dependent-held assets) at $1.5 million in estimated totals. That
              is a policy, not a midpoint. Today {fmt(openEnded.knownCount)}{" "}
              such rows, {pct(openEnded.knownCount, totals.knownCount)} percent
              of transactions, supply{" "}
              {pct(openEnded.estimate, totals.estimate)} percent of the
              estimated total. The sum of every range&rsquo;s minimum is{" "}
              ${fmt(Math.round(totals.floor / 1_000_000))} million; the estimate
              is ${fmt(Math.round(totals.estimate / 1_000_000))} million.
            </li>
            <li>
              <strong className="text-neutral-900">
                Unascertainable values stay unknown.
              </strong>{" "}
              When a filing reports a transaction value as &ldquo;not readily
              ascertainable,&rdquo; Open Cabinet records no range for it. The
              row appears in the table with the filing&rsquo;s wording and is
              left out of every dollar total.
              {totals.unknownCount > 0
                ? ` ${fmt(totals.unknownCount)} rows are in that state today.`
                : " No rows are in that state today."}
            </li>
            <li>
              <strong className="text-neutral-900">
                Coverage is limited to officials with publicly downloadable filings.
              </strong>{" "}
              Open Cabinet tracks {totalOfficials} officials overall,
              including {currentOfficialCount} in the main directory view.
              That directory excludes prior-administration holdovers but keeps
              recent former officials when their filings are part of the current
              executive-branch record. Hundreds more have filed transaction
              reports that require individual Form 201 requests from OGE, a
              process we are working to expand.
            </li>
            <li>
              <strong className="text-neutral-900">
                Trump dominates the aggregate counts.
              </strong>{" "}
              President Trump accounts for{" "}
              {trumpTransactions.toLocaleString()} of{" "}
              {currentTransactions.toLocaleString()} tracked transactions in
              the main directory view and{" "}
              {trumpLateTransactions.toLocaleString()} of{" "}
              {currentLateTransactions.toLocaleString()} late-filed
              transactions. Across all other main-directory officials, Open
              Cabinet counts {nonTrumpLateTransactions.toLocaleString()}{" "}
              late-filed transactions.
            </li>
            <li>
              <strong className="text-neutral-900">
                &ldquo;Late&rdquo; means self-certified late.
              </strong>{" "}
              A transaction counts as late only when the filer marked the
              278-T column indicating notification was received more than 30
              days before filing &mdash; the official{"'"}s own certification,
              not our computation. Agencies can grant filing extensions of up
              to 90 days that are not visible in public filings, and $200
              late-fee assessments surface publicly only when OGE reviewers
              note them on an individual filing.
            </li>
            <li>
              <strong className="text-neutral-900">
                Former officials remain in the dataset.
              </strong>{" "}
              If OGE filings are relevant to the executive-branch record, Open
              Cabinet keeps the transactions and labels the official as former
              rather than deleting historical data.
            </li>
            <li>
              <strong className="text-neutral-900">
                Parsing is automated; checking is partly automated and partly by hand.
              </strong>{" "}
              A vision model reads each filing PDF and proposes rows. A second
              program that never sees the model&rsquo;s output reads the same
              PDF&rsquo;s text layer and compares type, date, amount, late
              flag and printed row numbers, row for row. Where the two
              disagree on a new filing, nothing from it is published until a
              person decides; where they disagree on a row already on the
              site, the row stays up marked under review until a person
              decides. Scanned
              filings have no text layer, so that comparison cannot run; those
              rows depend on a visual check against the printed row numbers
              and are the largest share of the dataset. The current state of
              that comparison is below under AI transparency. Source PDFs are
              linked from each official{"'"}s page.
            </li>
            <li>
              <strong className="text-neutral-900">
                Filings contain errors, and the site shows them as printed.
              </strong>{" "}
              When a filing prints something that cannot be right, the row
              keeps the filing&rsquo;s value and carries a numbered note
              under the table saying what the page shows and who decided how
              to count it. Two examples from the record. A July 2025 filing
              for Labor Secretary Lori Chavez-DeRemer prints three company
              names across two numbered rows each, with the full trade
              columns repeated on both halves; each pair is counted as one
              sale, with a note, on a person&rsquo;s reading of the page. A
              May 2025 filing for HHS Secretary Robert F. Kennedy Jr. prints
              a trade date in the year 2225; the row shows 2025, the year
              the filing was posted and the year on the row above it. That
              correction, like every other, is recorded with the page and
              printed row in the review log in the public source repository.
            </li>
            <li>
              <strong className="text-neutral-900">
                Ticker symbols are not always provided.
              </strong>{" "}
              Some assets (private equity, real estate LLCs, retirement accounts)
              do not have ticker symbols.
            </li>
          </ul>
        </section>

        {/* AI transparency */}
        <section className="border-t border-neutral-200 pt-8">
          <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-4">
            AI transparency
          </h2>
          <p className="text-neutral-600 leading-relaxed mb-4">
            This project uses AI at several stages. In the interest of
            transparency, here is exactly where and how.
          </p>
          <div className="space-y-4 text-sm">
            <div>
              <div className="font-medium text-neutral-900">PDF parsing</div>
              <p className="text-neutral-500 mt-0.5">
                Each filing PDF is sent whole to a vision model (Claude), which
                returns the transaction table as structured rows. There is no
                separate text-extraction step in front of the model. Large
                filings are split into page ranges first. Every returned row
                passes a shape check: only the five legal transaction types,
                the eleven legal dollar ranges or an explicit unknown, real
                calendar dates, and no extra fields. Where the PDF has a text
                layer, an independent program (pdftotext plus a column parser)
                reads the same table and the two are compared row for row.
              </p>
              {coverage ? (
                <p className="text-neutral-500 mt-2">
                  As of the last check, that comparison agreed on{" "}
                  {fmt(agreedRows)} of {fmt(coverage.totalRows)} published
                  rows, across{" "}
                  {coverage.filings.checked_tuple_agreement} of{" "}
                  {coverage.totalFilings} filings. {fmt(mismatchRows)} rows in{" "}
                  {coverage.filings.checked_tuple_mismatch} filings are in
                  disagreement and awaiting a person&rsquo;s review. {fmt(scanRows)}{" "}
                  rows are in scanned filings with no text layer, where the
                  text comparison cannot run. {fmt(layoutRows)} rows are in layouts
                  the comparison program cannot yet read.{" "}
                  {fmt(coverage.unstampedRows)} rows are not yet attributed to
                  a specific filing. The comparison covers type, date, amount,
                  late flag and row count; it does not compare asset names or
                  ticker symbols.
                </p>
              ) : null}
              {coverage && ocrFilings > 0 ? (
                <p className="text-neutral-500 mt-2">
                  For scanned filings, a second program renders each page to
                  an image, runs optical character recognition on it
                  (tesseract, locally, ignoring any text the scanner
                  embedded) and compares the result the same way. It has run
                  on {ocrFilings} scanned filings. Because OCR misreads more
                  often than a text layer, its results are counted row by row
                  in the section below: a row counts as checked only when the
                  OCR read that exact row the same way, a row it read
                  differently is under review, and a row it could not read is
                  not yet checked.
                </p>
              ) : null}
            </div>
            <div>
              <div className="font-medium text-neutral-900">
                Official summaries
              </div>
              <p className="text-neutral-500 mt-0.5">
                The plain-English summary on each official{"'"}s page is
                either a fixed template built from the counts, or prose a
                model wrote from a block of facts computed in code. The model
                never sees the transactions, only the computed facts. Since
                September 2026, model-written prose is published only after a
                person reads and approves it, and only if every number in it
                appears in the facts it was given. Summaries published before
                that gate existed were not individually approved. When new
                filings change an official&rsquo;s facts, the existing summary
                is kept and marked as behind the data until a new one is
                approved. Summaries do not make editorial judgments.
              </p>
            </div>
            <div>
              <div className="font-medium text-neutral-900">News coverage</div>
              <p className="text-neutral-500 mt-0.5">
                Articles in the {"\""}In the News{"\""} sections are collected
                via AI-assisted web search across major outlets (ProPublica,
                CNBC, NOTUS, Bloomberg, etc.). Every linked article is a real,
                published piece, no AI-generated news content.
              </p>
            </div>
            <div>
              <div className="font-medium text-neutral-900">
                Codebase
              </div>
              <p className="text-neutral-500 mt-0.5">
                Architecture, design and editorial decisions are
                human-directed. Automated tooling helps with implementation,
                but it does not decide what to track, what to publish or how to
                frame the findings.
              </p>
            </div>
            <div>
              <div className="font-medium text-neutral-900">
                What AI does not do
              </div>
              <p className="text-neutral-500 mt-0.5">
                AI does not generate or fabricate transaction data. It does not
                make editorial judgments about whether trades are legal or
                ethical. It does not determine which officials to track or how
                to present findings. All data traces back to a government-filed
                PDF.
              </p>
            </div>
          </div>
        </section>

        {/* Download the data */}
        <section className="border-t border-neutral-200 pt-8">
          <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-4">
            Download the data
          </h2>
          <p className="text-neutral-600 leading-relaxed">
            The full dataset is available for journalists, researchers and
            anyone who wants to work with it.{" "}
            <Link
              href="/download"
              className="underline hover:text-neutral-900 font-medium"
            >
              Download as CSV or JSON
            </Link>
            . Includes all transactions, official metadata and ticker
            mappings. Federal government data carries no copyright.
          </p>
        </section>

        {/* Photographs */}
        <section className="border-t border-neutral-200 pt-8">
          <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-4">
            Photographs
          </h2>
          <p className="text-sm text-neutral-600 leading-relaxed">
            Official portraits are U.S. government works in the public domain,
            retrieved from agency press pages and Wikimedia Commons. Where an
            official has no released portrait, we crop a headshot from another
            public-domain federal photograph &mdash; Sara Bailey{"'"}s is taken
            from a U.S. Senate photo released by the office of Sen. John
            Cornyn.
          </p>
        </section>

        {/* Corrections */}
        <section className="border-t border-neutral-200 pt-8">
          <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-4">
            Corrections
          </h2>
          <p className="text-sm text-neutral-600 leading-relaxed">
            <strong className="text-neutral-900">July 25, 2026</strong> &mdash;
            Corrected the statutory citation for the $200 late-filing fee from
            5 U.S.C. Section 13106(a) to Section 13106(d), and clarified that
            the fee attaches only when a report runs more than 30 days past
            its deadline, not at the deadline itself. Claims about how often
            the fee is waived are now attributed to reporting on Congress;
            comparable data for the executive branch is not public.
          </p>
        </section>

        <VerificationSummary summary={rowVerification?.summary ?? null} />

        {/* How names become tickers */}
        <section id="assets" className="border-t border-neutral-200 pt-8 scroll-mt-24">
          <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-4">
            How names become tickers
          </h2>
          <p className="text-neutral-600 leading-relaxed mb-4">
            Filings print asset names the way a broker statement does:
            &ldquo;TEXAS INSTRS INC,&rdquo; &ldquo;Apple Inc Com Solicited Order
            Discretion Exercised,&rdquo; a municipal bond with its coupon and
            maturity. Most print no ticker symbol. To put a trade on a company
            page, the site first decides what kind of thing the row is from the
            printed text (stock, ETF, mutual fund, preferred, corporate note,
            municipal bond, Treasury, crypto, private holding, option). Bonds,
            notes, preferreds, funds and private holdings never get a stock
            ticker.
          </p>
          <p className="text-neutral-600 leading-relaxed mb-4">
            A stock or ETF row is tied to a company only on exact evidence: a
            symbol the filing itself prints, confirmed by the exchange listing
            of the same name; or the printed name, after broker boilerplate is
            removed, matching one security by exact name on two public reference
            lists (the Nasdaq symbol directory and the SEC&rsquo;s issuer list)
            that agree on the symbol; or a person&rsquo;s recorded decision.
            One allowance for ETFs, whose legal and marketing names differ: a
            printed ETF symbol is accepted when every distinguishing word of
            the printed name appears in the listing (&ldquo;Vanguard Tax-Exempt
            Bond Index Fund ETF&rdquo; and &ldquo;Vanguard Tax-Exempt Bond
            ETF&rdquo;). Nothing is matched by similarity, and no model is asked
            to guess. A name that matches on only one list, or is cut short by
            the broker, waits for a person. A ticker is attached only where an
            independent reader also read the same name.
          </p>
          {assets ? (
            <p className="text-neutral-600 leading-relaxed">
              Today: {stockRows.toLocaleString("en-US")} rows are stocks or ETFs.
              {" "}{(assetTiers.T1 ?? 0).toLocaleString("en-US")} are tied to a company on that evidence, and {onCompanyPages.toLocaleString("en-US")} of those appear on company pages (the rest belong to former officials outside the main directory or lack an independent reading of the name);
              {" "}{((assetTiers.T2 ?? 0) + (assetTiers.none ?? 0)).toLocaleString("en-US")} show the printed name only until a person looks.
              Reference lists fetched {assets.sources["nasdaqlisted.txt"]?.fetchedAt.slice(0, 10) ?? "n/a"}.
            </p>
          ) : null}
        </section>

        {/* Disclaimers */}
        <section className="border-t border-neutral-200 pt-8">
          <p className="text-sm text-neutral-500">
            This tool is for informational and journalism purposes only. Nothing
            here constitutes investment advice. Asset values and transaction
            amounts are reported in ranges as required by federal law. This
            database may not include all executive branch filers. Data sourced
            from the U.S. Office of Government Ethics under the Ethics in
            Government Act (5 U.S.C. Section 13107). Federal government
            documents carry no copyright (17 U.S.C. Section 105).
          </p>
        </section>
      </div>
    </div>
  );
}
