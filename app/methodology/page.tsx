import type { Metadata } from "next";
import Link from "next/link";
import AboutScrolly from "../components/about-scrolly";

export const metadata: Metadata = {
  title: "Methodology — Open Cabinet",
  description:
    "How Open Cabinet tracks executive branch financial disclosures. The STOCK Act, divestiture deadlines, late filings and how this tool was built.",
};

export default function MethodologyPage() {
  return (
    <div>
      {/* Hero */}
      <div className="mx-auto max-w-3xl px-4 pt-16 pb-12">
        <h1 className="font-[family-name:var(--font-source-serif)] text-4xl md:text-5xl text-neutral-900 mb-4 leading-tight">
          Methodology
        </h1>
        <p className="text-neutral-500 max-w-xl leading-relaxed">
          How we collect, parse and verify executive branch financial
          disclosures — and the federal laws that require them.
        </p>
        <p className="text-xs text-neutral-400 mt-3">Last updated April 17, 2026</p>
      </div>

      {/* Scrollytelling sections */}
      <AboutScrolly />

      {/* Quick facts — infographic style */}
      <div className="bg-neutral-900 text-white py-16 px-4">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-[family-name:var(--font-source-serif)] text-2xl mb-2">
            By the numbers
          </h2>
          <p className="text-neutral-400 text-sm mb-10">
            Key facts about executive branch financial disclosure, sourced from
            federal law, OGE data and published investigations.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="border border-neutral-700 p-5">
              <div className="font-[family-name:var(--font-dm-mono)] text-3xl font-semibold text-white mb-2">
                $200
              </div>
              <div className="text-sm text-neutral-300 mb-2">
                The penalty for filing a stock trade disclosure late. It{"'"}s
                routinely waived.
              </div>
              <a href="https://www.law.cornell.edu/uscode/text/5/13106" className="text-[10px] text-neutral-500 hover:text-neutral-300 underline" target="_blank" rel="noopener noreferrer">
                5 U.S.C. Section 13106(a)
              </a>
            </div>

            <div className="border border-neutral-700 p-5">
              <div className="font-[family-name:var(--font-dm-mono)] text-3xl font-semibold text-white mb-2">
                0
              </div>
              <div className="text-sm text-neutral-300 mb-2">
                Criminal prosecutions ever brought under the STOCK Act{"'"}s
                insider trading provisions.
              </div>
              <a href="https://www.law.georgetown.edu/american-criminal-law-review/wp-content/uploads/sites/15/2021/05/58-0-Mesiya-Failures-of-the-Stock-Act-UPDATED.pdf" className="text-[10px] text-neutral-500 hover:text-neutral-300 underline" target="_blank" rel="noopener noreferrer">
                Campaign Legal Center; Georgetown Law (2021)
              </a>
            </div>

            <div className="border border-neutral-700 p-5">
              <div className="font-[family-name:var(--font-dm-mono)] text-3xl font-semibold text-white mb-2">
                14 sec
              </div>
              <div className="text-sm text-neutral-300 mb-2">
                Floor debate before Congress gutted the STOCK Act{"'"}s online
                disclosure database in 2013.
              </div>
              <a href="https://www.congress.gov/bill/113th-congress/senate-bill/716" className="text-[10px] text-neutral-500 hover:text-neutral-300 underline" target="_blank" rel="noopener noreferrer">
                S.716, 113th Congress
              </a>
            </div>

            <div className="border border-neutral-700 p-5">
              <div className="font-[family-name:var(--font-dm-mono)] text-3xl font-semibold text-white mb-2">
                4
              </div>
              <div className="text-sm text-neutral-300 mb-2">
                OGE directors in a single year (2025). The Senate-confirmed
                director was removed by email on a Friday night.
              </div>
              <a href="https://www.citizensforethics.org/reports-investigations/crew-investigations/trumps-unprecedented-meddling-has-turned-oge-into-a-revolving-door/" className="text-[10px] text-neutral-500 hover:text-neutral-300 underline" target="_blank" rel="noopener noreferrer">
                CREW (February 2025)
              </a>
            </div>
          </div>
        </div>
      </div>

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
                Coverage is limited to officials with publicly downloadable filings.
              </strong>{" "}
              Open Cabinet tracks 34 of the most senior appointees. Hundreds
              more have filed transaction reports that require individual
              Form 201 requests from OGE — a process we are working to expand.
            </li>
            <li>
              <strong className="text-neutral-900">
                PDF parsing is automated with human review.
              </strong>{" "}
              Transaction data is extracted from OGE filings using AI and
              validated against a regression test suite of hand-verified
              reference files. Source PDFs are linked from each official{"'"}s
              page for independent verification.
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
                We use{" "}
                <a href="https://github.com/jsoma/natural-pdf" className="underline hover:text-neutral-300" target="_blank" rel="noopener noreferrer">natural-pdf</a>
                {" "}(by data journalist{" "}
                <a href="https://github.com/jsoma" className="underline hover:text-neutral-300" target="_blank" rel="noopener noreferrer">Jonathan Soma</a>)
                {" "}to extract text from every page of every PDF, then Claude
                Opus parses each page into structured data. This page-by-page
                approach handles scanned documents and avoids token limits.
                All parsed data is validated against source PDFs through
                automated checks.
              </p>
            </div>
            <div>
              <div className="font-medium text-neutral-900">
                Official summaries
              </div>
              <p className="text-neutral-500 mt-0.5">
                The plain-English summary on each official{"'"}s page is
                AI-generated from their parsed transaction data. Summaries
                describe what the data shows — they do not make editorial
                judgments. Each is reviewed for factual accuracy.
              </p>
            </div>
            <div>
              <div className="font-medium text-neutral-900">News coverage</div>
              <p className="text-neutral-500 mt-0.5">
                Articles in the {"\""}In the News{"\""} sections are collected
                via AI-assisted web search across major outlets (ProPublica,
                CNBC, NOTUS, Bloomberg, etc.). Every linked article is a real,
                published piece — no AI-generated news content.
              </p>
            </div>
            <div>
              <div className="font-medium text-neutral-900">
                Codebase
              </div>
              <p className="text-neutral-500 mt-0.5">
                Built by Trevor Brown with the assistance of Claude Code,
                Anthropic{"'"}s CLI development tool.
                Architecture, design and editorial decisions are
                human-directed.
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
