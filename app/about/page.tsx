import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — Open Cabinet",
  description:
    "How Open Cabinet tracks executive branch financial disclosures. Data sources, methodology, legal basis, and known limitations.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-[family-name:var(--font-instrument-serif)] text-4xl text-neutral-900 mb-6">
        About This Project
      </h1>

      <div className="space-y-10 text-neutral-700 leading-relaxed">
        <section>
          <p>
            Open Cabinet tracks financial transactions reported by executive
            branch officials under the STOCK Act. Congress has more than a dozen
            stock trackers. The executive branch has had zero. This fills that
            gap.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">
            What the STOCK Act requires
          </h2>
          <p>
            The Stop Trading on Congressional Knowledge Act of 2012 requires
            senior federal officials to disclose securities transactions within
            30 days and file a public report within 45 days. These disclosures
            are called 278-T Periodic Transaction Reports.
          </p>
          <p className="mt-3">
            Transaction amounts are reported in ranges (e.g., $1,001 to
            $15,000), not exact figures. This is by design in federal law. Every
            number on this site reflects those ranges, not precise dollar
            amounts.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">
            Where the data comes from
          </h2>
          <p>
            All data is sourced from the U.S. Office of Government Ethics, which
            publishes financial disclosures for executive branch officials.
            Reports are available through the{" "}
            <a
              href="https://extapps2.oge.gov/201/Presiden.nsf"
              className="underline hover:text-neutral-900"
              target="_blank"
              rel="noopener noreferrer"
            >
              OGE public disclosure portal
            </a>
            .
          </p>
          <p className="mt-3">
            Each official{"'"}s transaction data is extracted from their 278-T
            filing PDFs. These PDFs list each transaction with the asset
            description, transaction type (sale or purchase), date, amount
            range, and whether the filing was late.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">
            Methodology
          </h2>
          <p>
            For the current version, transaction data has been manually
            extracted from OGE filing PDFs. Each entry is verified against the
            original document. Automated PDF parsing is planned for future
            versions.
          </p>

          <h3 className="text-sm font-semibold text-neutral-900 mt-4 mb-2">
            What{"'"}s included
          </h3>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>
              Periodic transaction reports (278-T) for officials with publicly
              available filings
            </li>
            <li>
              Transaction details: asset name, ticker symbol (when available),
              type, date, amount range
            </li>
            <li>Late filing flags based on the 30-day notification window</li>
          </ul>

          <h3 className="text-sm font-semibold text-neutral-900 mt-4 mb-2">
            What{"'"}s not included
          </h3>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>
              Annual financial disclosures (278 reports) showing total holdings
            </li>
            <li>
              Officials whose disclosures require an OGE Form 201 request
            </li>
            <li>
              Blind trust arrangements, which are exempt from transaction
              reporting
            </li>
            <li>
              Officials who have not filed any 278-T reports during the tracking
              period
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">
            Late filings
          </h2>
          <p>
            When a transaction report is marked as having a notification
            received over 30 days ago, we flag it as a late filing. Under the
            STOCK Act, officials must notify their agency ethics office within
            30 days of a covered transaction. Late filings may indicate
            compliance issues, though they are common and do not necessarily
            suggest wrongdoing.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">
            Legal basis
          </h2>
          <p>
            All data displayed here comes from public records filed under the
            Ethics in Government Act (5 U.S.C. Section 13107). Federal
            government documents carry no copyright protection (17 U.S.C.
            Section 105). The news media exception in the Ethics in Government
            Act explicitly permits dissemination of financial disclosures to the
            general public.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">
            Known limitations
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-sm">
            <li>
              <strong>Ranges, not exact amounts.</strong> All dollar values are
              reported in statutory ranges. A transaction listed as $1,001 to
              $15,000 could be worth $1,002 or $14,999.
            </li>
            <li>
              <strong>Not all officials are tracked.</strong> Some executive
              branch filers require individual OGE Form 201 requests to access
              their disclosures. This database includes only those with publicly
              available 278-T reports.
            </li>
            <li>
              <strong>PDF extraction is imperfect.</strong> Some filings use
              inconsistent formatting. Data is verified against original
              documents, but errors are possible.
            </li>
            <li>
              <strong>Ticker symbols are not always provided.</strong> Some
              assets (private equity, real estate LLCs, retirement accounts) do
              not have ticker symbols. We include them when they appear in the
              original filing.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">
            Disclaimers
          </h2>
          <p className="text-sm text-neutral-500">
            This tool is for informational and journalism purposes only. Nothing
            here constitutes investment advice. Asset values and transaction
            amounts are reported in ranges as required by federal law. Exact
            values are not disclosed. This database may not include all
            executive branch filers. Some disclosures require individual
            requests under OGE Form 201.
          </p>
        </section>

        <section className="border-t border-neutral-200 pt-8">
          <h2 className="text-lg font-semibold text-neutral-900 mb-3">
            About the developer
          </h2>
          <p>
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
      </div>

      <p className="text-xs text-neutral-400 mt-12">
        Source: U.S. Office of Government Ethics. Last updated April 2026.
      </p>
    </div>
  );
}
