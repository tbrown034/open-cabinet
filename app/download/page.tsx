import UnderReviewNote from "../components/under-review-note";
import type { Metadata } from "next";
import { readFile } from "fs/promises";
import path from "path";
import ResearchContactCta from "../components/research-contact-cta";

export const metadata: Metadata = {
  alternates: { canonical: "/download" },
  title: "Download Data",
  description: "Download executive branch financial transaction data as CSV or JSON.",
};

function fmt(n: number): string {
  return n.toLocaleString();
}

export default async function DownloadPage() {
  const fullDataset = JSON.parse(
    await readFile(
      path.join(process.cwd(), "public", "data", "full-dataset.json"),
      "utf-8"
    )
  ) as {
    exportedAt: string;
    officialCount: number;
    transactionCount: number;
    underReviewCount: number;
  };
  const txCount = fullDataset.transactionCount + fullDataset.underReviewCount;
  const officialCount = fullDataset.officialCount;

  const exports = [
    {
      name: "All Transactions",
      file: "/data/all-transactions.csv",
      format: "CSV",
      description:
        "One row per transaction. Includes official name, title, agency, asset description, ticker, type, date, amount range, midpoint estimate, late filing flag and verificationState. Keeps every row, including rows under review.",
      rows: `${fmt(txCount)} rows`,
    },
    {
      name: "Officials Summary",
      file: "/data/officials-summary.csv",
      format: "CSV",
      description:
        "One row per official. Includes name, title, agency, trade count, sales/purchases breakdown, late filing count, estimated total value and under-review count. Totals exclude rows under review.",
      rows: `${officialCount} rows`,
    },
    {
      name: "Full Dataset",
      file: "/data/full-dataset.json",
      format: "JSON",
      description:
        "Complete structured dataset with every transaction. transactionCount excludes score-0 rows; underReviewCount reports them separately, per official and for the dataset.",
      rows: `${officialCount} officials, ${fmt(txCount)} transactions`,
    },
  ];

  // Schema.org Dataset, so Google Dataset Search and AI crawlers describe
  // the download correctly: what it is, where it came from, the license,
  // the two file formats. Counts come from the export, never typed in.
  const datasetJsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Open Cabinet: executive branch stock transactions",
    description: `${txCount.toLocaleString("en-US")} securities transactions disclosed by ${officialCount} U.S. executive branch officials on OGE Form 278-T periodic transaction reports, with each row's source filing, verification state, instrument type and, where confirmed, ticker symbol.`,
    url: "https://open-cabinet.org/download",
    license: "https://github.com/tbrown034/open-cabinet/blob/main/LICENSE",
    isAccessibleForFree: true,
    creator: { "@type": "Person", name: "Trevor Brown", url: "https://trevorthewebdeveloper.com" },
    sourceOrganization: { "@type": "GovernmentOrganization", name: "U.S. Office of Government Ethics", url: "https://www.oge.gov" },
    temporalCoverage: "2020/..",
    keywords: ["STOCK Act", "financial disclosure", "executive branch", "OGE Form 278-T", "stock trades"],
    distribution: [
      { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: "https://open-cabinet.org/data/all-transactions.csv" },
      { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: "https://open-cabinet.org/data/full-dataset.json" },
      { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: "https://open-cabinet.org/data/officials-summary.csv" },
    ],
  };
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetJsonLd) }} />
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

      <UnderReviewNote count={fullDataset.underReviewCount} />
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

      <p className="text-xs text-neutral-400 mt-6">
        Asset values and transaction amounts are reported in ranges as required
        by federal law. Exact values are not disclosed.
      </p>

      <p className="text-xs text-neutral-400 mt-8">
        Data exported {new Date(fullDataset.exportedAt).toISOString().slice(0, 10)}. Federal
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

      <div className="mt-8">
        <ResearchContactCta context="download" />
      </div>
    </div>
  );
}
