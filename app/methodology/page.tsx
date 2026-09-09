import type { Metadata } from "next";
import Link from "next/link";
import AboutScrolly from "../components/about-scrolly";
import PipelineFlow from "../components/pipeline-flow";
import { getAllOfficials, getOfficialBySlug, getOfficialsIndex, officialForTotals } from "@/lib/data";
import UnderReviewNote from "../components/under-review-note";
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
  const countedOfficials = currentOfficials.map(officialForTotals);
  const underReviewCount = countedOfficials.reduce((sum, o) => sum + o.underReviewCount, 0);
  const currentTransactions = countedOfficials.reduce(
    (sum, official) => sum + official.transactions.length,
    0
  );
  const currentLateTransactions = countedOfficials.reduce(
    (sum, official) =>
      sum + official.transactions.filter((tx) => tx.lateFilingFlag).length,
    0
  );
  const countedTrumpRows = trump ? officialForTotals(trump).transactions : [];
  const trumpTransactions = countedTrumpRows.length;

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
    countedTrumpRows.filter((tx) => tx.lateFilingFlag).length;
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
          Executive branch public financial disclosures include periodic
          transaction reports and reports of holdings, income and other
          financial interests. Open Cabinet&rsquo;s trade dataset comes from
          278-T reports.
        </p>
        <ul className="space-y-3 text-neutral-600 leading-relaxed mb-4">
          <li>
            <strong className="text-neutral-900">OGE Form 278-T (Periodic Transaction Report).</strong>{" "}
            Covered securities transactions over $1,000 must be reported within
            30 days of notification, and no later than 45 days after the trade,
            subject to applicable extensions and reporting exemptions. This is what powers the trades, dollar volume and
            late-filing counts on this site.
          </li>
          <li>
            <strong className="text-neutral-900">OGE Form 278e (Nominee/New Entrant Report).</strong>{" "}
            Nominee reports accompany Senate-confirmed nominations; new entrant
            reports are generally due within 30 days of taking office. They
            disclose reportable holdings and other financial interests.
            These reports are outside this site&rsquo;s trade dataset.
          </li>
          <li>
            <strong className="text-neutral-900">OGE Form 278e (Annual Report).</strong>{" "}
            Generally due May 15, subject to eligibility rules and extensions,
            reporting holdings and other financial activity for the prior year.
            Annual-report ingestion is not part of the current trade pipeline.
          </li>
        </ul>
        <p className="text-sm text-neutral-500 mb-4">
          Source: OGE&rsquo;s{" "}
          <a href="https://www.oge.gov/web/278eGuide.nsf/Form_278-T" className="underline hover:text-neutral-900">transaction-report guide</a>
          {" "}and{" "}
          <a href="https://www.oge.gov/web/278eGuide.nsf/Overview" className="underline hover:text-neutral-900">report-type overview</a>.
        </p>
        <p className="text-neutral-600 leading-relaxed">
          Reported trades alone do not show all of an official&rsquo;s holdings
          or establish whether an official has fulfilled an ethics agreement.
        </p>
      </div>

      {/* The pipeline on one page */}
      <div id="pipeline" className="mx-auto max-w-3xl px-4 pb-8 scroll-mt-24">
        <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-2">
          How a filing gets added to the site
        </h2>
        <p className="text-neutral-600 leading-relaxed">
          Follow the filing from source PDF to publication: who does each
          step, when processing stops, and which evaluation is still being integrated.
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
              <UnderReviewNote count={underReviewCount} />
            </li>
            <li>
              <strong className="text-neutral-900">
                &ldquo;Late&rdquo; means self-certified late.
              </strong>{" "}
              A transaction counts as late only when the filer marked the
              278-T column indicating notification was received more than 30
              days before filing &mdash; the official{"'"}s own certification,
              not our computation. Agencies can grant filing extensions;
              some filings carry extension or fee annotations. The late flag
              alone does not establish whether a fee was assessed or paid.
            </li>
            <li>
              <strong className="text-neutral-900">
                Reports and trade dates have different scopes.
              </strong>{" "}
              Current-roster totals cover second-term reports. A trade before
              January 20, 2025 remains included when disclosed in a second-term
              report and is labeled on the official page. Prior-administration
              reports retained as history are excluded from current totals and
              charts; the original rows and source links are preserved.
              Daily checks flag newly missing OGE index listings. The manually
              started ingest also tests saved transaction-report URLs and prepares
              availability updates for review. An unavailable link does not establish why OGE
              removed or moved a record; timeouts remain unconfirmed.
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
              Claude PDF support proposes rows from the PDF. Code compares them
              with an independent text or OCR reading; a second model is used
              when those programs cannot confirm the rows. There is no routine
              third-model step. A person reviews the prepared data
              update before publication. Older rows have been checked through
              separate review runs; the recorded row statuses below describe
              their evidence. Source PDFs are linked from each official&rsquo;s page.
            </li>
            <li>
              <strong className="text-neutral-900">
                Filings contain errors; departures from the printed values are documented.
              </strong>{" "}
              When a filing prints something that appears wrong, a reviewer
              may retain the printed value or record a correction. A numbered
              note under the table explains the source wording and the decision. Two examples from the record. A July 2025 filing
              for Labor Secretary Lori Chavez-DeRemer prints three company
              names across two numbered rows each, with the full trade
              columns repeated on both halves; each pair is counted as one
              sale, with a note, on a person&rsquo;s reading of the page. A
              May 2025 filing for HHS Secretary Robert F. Kennedy Jr. prints
              a trade date in the year 2225; the row shows 2025, the year
              the filing was posted and the year on the row above it. That
              correction is recorded with the page and printed row in the
              review log in the public source repository.
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
                Each filing PDF is sent whole through{" "}
                <a href="https://platform.claude.com/docs/en/build-with-claude/pdf-support" className="underline hover:text-neutral-700">Claude PDF support</a>,
                {" "}which reads the document&rsquo;s text and page images and
                returns the transaction table as structured rows. There is no
                separate text-extraction step in front of the model. Large
                filings are split into page ranges first. Every returned row
                is checked for valid fields: five transaction types plus an explicit
                &ldquo;Unstated&rdquo; type with a note, eleven dollar ranges or
                an explicit unknown, calendar dates, and no unexpected fields.
                Reviewed source exceptions can retain an undated row or an
                impossible printed date with an explanatory note. Where the PDF has a text
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
                  disagreement in that filing-level comparison. Later model
                  checks or recorded decisions may resolve individual rows;
                  the row-level totals below show their current status. {fmt(scanRows)}{" "}
                  rows are in scanned filings with no text layer, where the
                  text comparison cannot run. {fmt(layoutRows)} rows are in layouts
                  or form types the text comparison program cannot read.{" "}
                  {fmt(coverage.unstampedRows)} rows are not yet attributed to
                  a specific filing. The comparison covers type, date, amount,
                  late flag and row count, with a limited name-word check.
                  It does not verify ticker symbols; asset resolution and
                  the independent name check are separate.
                </p>
              ) : null}
              {coverage && ocrFilings > 0 ? (
                <p className="text-neutral-500 mt-2">
                  For scanned filings, a second program renders each page to
                  an image, runs optical character recognition on it
                  (tesseract, locally, ignoring any text the scanner
                  embedded) and compares the result the same way. It has run
                  on {ocrFilings} filings. A confirming OCR comparison skips
                  the second model. If OCR disagrees or cannot read the rows,
                  the ingest tries an independent model read.
                </p>
              ) : null}
            </div>
            <div id="fallback-read" className="scroll-mt-24">
              <div className="font-medium text-neutral-900">
                Conditional fallback model
              </div>
              <p className="text-neutral-500 mt-0.5">
                A second provider&rsquo;s model independently extracts rows only
                when readable PDF text or OCR cannot confirm Claude&rsquo;s first
                read. It is a fallback second read, not a routine third-model
                audit. Every proposed row must agree or the filing stops for
                human review. Model agreement reduces transcription risk but
                does not guarantee that a filing itself is accurate.
              </p>
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
                approved. The prompt prohibits editorial judgments and
                compliance conclusions; review remains necessary because a
                number appearing in the facts does not establish that a
                sentence uses it correctly.
              </p>
            </div>
            <div>
              <div className="font-medium text-neutral-900">Ask the Data</div>
              <p className="text-neutral-500 mt-0.5">
                Claude turns a reader&rsquo;s question into a constrained query
                plan. Code validates that plan, queries the published checked
                rows and calculates the answer. The default answer sentence is
                a fixed template. An optional configuration lets a model phrase
                the result; number and language checks must pass or the template
                remains. The answer identifies which process was used.
              </p>
            </div>
            <div>
              <div className="font-medium text-neutral-900">Subscriber digests</div>
              <p className="text-neutral-500 mt-0.5">
                An operator can ask Claude to draft a digest introduction from
                filing facts, sample transactions and existing official
                summaries. It is shown in the admin draft for review before
                sending. The saved introduction is included only when its
                filing set still matches the digest; generating it sends no email.
              </p>
            </div>
            <div>
              <div className="font-medium text-neutral-900">News coverage</div>
              <p className="text-neutral-500 mt-0.5">
                The {"\""}In the News{"\""} sections link to outside reporting.
                The article list is curated separately from filing ingestion;
                search tools can help find coverage. Changes to the saved list
                are reviewed before publication. The site does not generate
                the linked articles.
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
                Models are instructed to extract the filing&rsquo;s values,
                not invent transactions or judge whether trades are legal or
                ethical. They can misread a page; the checks and review process
                above address that risk. Coverage is set by the project&rsquo;s
                source rules. Published transaction rows retain their government
                filing links.
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

        <VerificationSummary
          summary={rowVerification?.summary ?? null}
          generatedAt={rowVerification?.generatedAt}
        />

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
            municipal bond, Treasury, crypto, private holding, option). Only a
            stock or an exchange-traded fund can get a ticker; bonds, notes,
            preferreds, mutual funds and private holdings never do.
          </p>
          <p className="text-neutral-600 leading-relaxed mb-4">
            A stock or ETF row is tied to a company only on exact evidence: a
            symbol the filing itself prints, confirmed by the exchange listing
            of the same name; or the printed name, after broker boilerplate is
            removed, matching one security by exact name on two public reference
            lists (the Nasdaq symbol directory and the SEC&rsquo;s issuer list)
            that agree on the symbol; or a person&rsquo;s recorded decision.
            An exact listed name with a printed share class can also resolve
            when only one listed class matches and the SEC reference has no
            symbol for that name or corroborates the issuer.
            One allowance for ETFs, whose legal and marketing names differ: a
            printed ETF symbol is accepted when every distinguishing word of
            the printed name appears in the listing (&ldquo;Vanguard Tax-Exempt
            Bond Index Fund ETF&rdquo; and &ldquo;Vanguard Tax-Exempt Bond
            ETF&rdquo;). Selecting a ticker from the reference lists does not
            use fuzzy matching or a model guess. Apart from the share-class
            exception above, a name found on only one list, or cut short by the
            broker, waits for a person. A public ticker also needs a matching
            independent name read or a recorded human decision. That name check
            tolerates spelling and wording differences, so it is not a guarantee
            of exact transcription.
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
