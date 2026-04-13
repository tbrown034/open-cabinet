import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Download Data — Open Cabinet",
  description: "Download executive branch financial transaction data as CSV or JSON.",
};

const exports = [
  {
    name: "All Transactions",
    file: "/data/all-transactions.csv",
    format: "CSV",
    description:
      "One row per transaction. Includes official name, title, agency, asset description, ticker, type, date, amount range, midpoint estimate and late filing flag.",
    rows: "2,237 rows",
  },
  {
    name: "Officials Summary",
    file: "/data/officials-summary.csv",
    format: "CSV",
    description:
      "One row per official. Includes name, title, agency, trade count, sales/purchases breakdown, late filing count and estimated total value.",
    rows: "34 rows",
  },
  {
    name: "Full Dataset",
    file: "/data/full-dataset.json",
    format: "JSON",
    description:
      "Complete structured dataset with all officials and their transactions. Suitable for programmatic analysis.",
    rows: "34 officials, 2,237 transactions",
  },
];

export default function DownloadPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <header className="mb-12">
        <h1 className="font-[family-name:var(--font-source-serif)] text-4xl text-neutral-900 mb-4">
          Download Data
        </h1>
        <p className="text-neutral-500 max-w-xl leading-relaxed">
          All data is sourced from public financial disclosures filed with the
          U.S. Office of Government Ethics. Free to use for journalism,
          research and analysis.
        </p>
      </header>

      <div className="space-y-6">
        {exports.map((item) => (
          <div
            key={item.file}
            className="border border-neutral-200 p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-neutral-900 font-medium">{item.name}</h2>
                <p className="text-sm text-neutral-500 mt-1">
                  {item.description}
                </p>
                <div className="flex gap-4 mt-2 text-xs text-neutral-400">
                  <span>{item.format}</span>
                  <span>{item.rows}</span>
                </div>
              </div>
              <a
                href={item.file}
                download
                className="shrink-0 border border-neutral-900 px-4 py-2 text-sm text-neutral-900 hover:bg-neutral-900 hover:text-white transition-colors"
              >
                Download
              </a>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-neutral-400 mt-8">
        Data updated {new Date().toISOString().split("T")[0]}. Federal
        government documents carry no copyright (
        <a
          href="https://www.law.cornell.edu/uscode/text/17/105"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-neutral-600"
        >
          17 U.S.C. &sect;105
        </a>
        ). If you use this data, please credit Open Cabinet and link to the
        source.
      </p>
    </div>
  );
}
