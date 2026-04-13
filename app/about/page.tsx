import type { Metadata } from "next";
import AboutScrolly from "../components/about-scrolly";

export const metadata: Metadata = {
  title: "About — Open Cabinet",
  description:
    "How Open Cabinet tracks executive branch financial disclosures. The STOCK Act, divestiture deadlines, late filings, and how this tool was built.",
};

export default function AboutPage() {
  return (
    <div>
      {/* Hero */}
      <div className="mx-auto max-w-3xl px-4 pt-16 pb-12">
        <h1 className="font-[family-name:var(--font-source-serif)] text-4xl md:text-5xl text-neutral-900 mb-4 leading-tight">
          About Open Cabinet
        </h1>
        <p className="text-neutral-500 max-w-xl leading-relaxed">
          An accountability tool that parses executive branch transaction
          data into searchable, sortable, and visual formats — something no
          public tool has done before.
        </p>
        <p className="text-xs text-neutral-400 mt-3">Last updated April 2026</p>
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
            federal law, OGE data, and published investigations.
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
              <div className="text-[10px] text-neutral-500">
                5 U.S.C. Section 13106(a)
              </div>
            </div>

            <div className="border border-neutral-700 p-5">
              <div className="font-[family-name:var(--font-dm-mono)] text-3xl font-semibold text-white mb-2">
                0
              </div>
              <div className="text-sm text-neutral-300 mb-2">
                Criminal prosecutions ever brought under the STOCK Act{"'"}s
                insider trading provisions.
              </div>
              <div className="text-[10px] text-neutral-500">
                Campaign Legal Center, Georgetown Law (2021)
              </div>
            </div>

            <div className="border border-neutral-700 p-5">
              <div className="font-[family-name:var(--font-dm-mono)] text-3xl font-semibold text-white mb-2">
                14 sec
              </div>
              <div className="text-sm text-neutral-300 mb-2">
                Floor debate before Congress gutted the STOCK Act{"'"}s online
                disclosure database in 2013.
              </div>
              <div className="text-[10px] text-neutral-500">
                S.716, 113th Congress (Roll Call, April 2013)
              </div>
            </div>

            <div className="border border-neutral-700 p-5">
              <div className="font-[family-name:var(--font-dm-mono)] text-3xl font-semibold text-white mb-2">
                19+
              </div>
              <div className="text-sm text-neutral-300 mb-2">
                Stock trackers that exist for Congress. Before Open Cabinet, the
                executive branch had zero.
              </div>
              <div className="text-[10px] text-neutral-500">
                Capitol Trades, Quiver, Unusual Whales, et al.
              </div>
            </div>

            <div className="border border-neutral-700 p-5">
              <div className="font-[family-name:var(--font-dm-mono)] text-3xl font-semibold text-white mb-2">
                4
              </div>
              <div className="text-sm text-neutral-300 mb-2">
                OGE directors in a single year (2025). The Senate-confirmed
                director was removed by email on a Friday night.
              </div>
              <div className="text-[10px] text-neutral-500">
                CNN, CREW (February 2025)
              </div>
            </div>

            <div className="border border-neutral-700 p-5">
              <div className="font-[family-name:var(--font-dm-mono)] text-3xl font-semibold text-white mb-2">
                $72M
              </div>
              <div className="text-sm text-neutral-300 mb-2">
                Capital gains tax deferred by Rex Tillerson when he divested
                from ExxonMobil to become Secretary of State.
              </div>
              <div className="text-[10px] text-neutral-500">
                26 U.S.C. Section 1043; CNBC (March 2018)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Static sections */}
      <div className="mx-auto max-w-3xl px-4 py-16 space-y-12">
        {/* Known limitations */}
        <section>
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
                29 of 43 officials with downloadable filings.
              </strong>{" "}
              Approximately 179 additional officials require individual Form 201
              requests to access their disclosures.
            </li>
            <li>
              <strong className="text-neutral-900">
                PDF extraction is imperfect.
              </strong>{" "}
              Some filings use inconsistent formatting. Data is verified against
              original documents, but errors are possible.
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

        {/* Related resources */}
        <section className="border-t border-neutral-200 pt-8">
          <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-4">
            Related resources
          </h2>
          <ul className="space-y-3 text-sm">
            <li>
              <a
                href="https://projects.propublica.org/trump-team-financial-disclosures/"
                className="underline hover:text-neutral-900 font-medium"
                target="_blank"
                rel="noopener noreferrer"
              >
                ProPublica: Trump Team Financial Disclosures
              </a>
              <span className="text-neutral-500">
                {" "}— Searchable access to raw disclosure documents for 1,500+
                appointees.
              </span>
            </li>
            <li>
              <a
                href="https://www.opensecrets.org/biden/executive-branch"
                className="underline hover:text-neutral-900 font-medium"
                target="_blank"
                rel="noopener noreferrer"
              >
                OpenSecrets: Executive Branch
              </a>
              <span className="text-neutral-500">
                {" "}— Financial connections between officials and the industries
                they regulate.
              </span>
            </li>
            <li>
              <a
                href="https://extapps2.oge.gov/201/Presiden.nsf"
                className="underline hover:text-neutral-900 font-medium"
                target="_blank"
                rel="noopener noreferrer"
              >
                OGE Public Disclosure Portal
              </a>
              <span className="text-neutral-500">
                {" "}— The primary source for all data on this site.
              </span>
            </li>
          </ul>
        </section>

        {/* About the developer */}
        <section className="border-t border-neutral-200 pt-8">
          <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-4">
            About the developer
          </h2>
          <p className="text-neutral-600 leading-relaxed">
            Built by{" "}
            <a
              href="https://trevorthewebdeveloper.com"
              className="underline hover:text-neutral-900"
              target="_blank"
              rel="noopener noreferrer"
            >
              Trevor Brown
            </a>
            , investigative data journalist turned web developer. 15 years of
            political reporting, including six years covering elections, dark
            money, financial disclosures, and government accountability at
            Oklahoma Watch. This project bridges both worlds — journalism
            instinct driving a developer tool.
          </p>
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
                Transaction data is extracted from OGE filing PDFs using
                Anthropic{"'"}s Claude API (claude-haiku-4-5). Each table row is
                read and output as structured JSON. All parsed data is verified
                against the source PDF.
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
                The application was built with Claude Code
                (claude-opus-4-6), Anthropic{"'"}s CLI development tool. All
                code, architecture, and editorial decisions are human-directed.
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

        {/* Open source + contact */}
        <section className="border-t border-neutral-200 pt-8">
          <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-4">
            Open source
          </h2>
          <p className="text-neutral-600 leading-relaxed">
            Open Cabinet is open source under the{" "}
            <a
              href="https://github.com/tbrown034/open-cabinet/blob/main/LICENSE"
              className="underline hover:text-neutral-900"
              target="_blank"
              rel="noopener noreferrer"
            >
              MIT License
            </a>
            . The code, data pipeline, and research are available on{" "}
            <a
              href="https://github.com/tbrown034/open-cabinet"
              className="underline hover:text-neutral-900"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            . Found a bug or data error?{" "}
            <a
              href="https://github.com/tbrown034/open-cabinet/issues"
              className="underline hover:text-neutral-900"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open an issue
            </a>{" "}
            or email{" "}
            <a
              href="mailto:trevorbrown.web@gmail.com"
              className="underline hover:text-neutral-900"
            >
              trevorbrown.web@gmail.com
            </a>
            .
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
