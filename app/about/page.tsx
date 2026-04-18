import type { Metadata } from "next";
import Link from "next/link";
import FeedbackForm from "../components/feedback-form";

export const metadata: Metadata = {
  title: "About — Open Cabinet",
  description:
    "About Open Cabinet and the journalist-developer who built it. Open source executive branch financial disclosure tracker.",
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
          An accountability tool that parses executive branch financial
          disclosure data into searchable, sortable and visual formats —
          tracking stock trades and potential conflicts of interest.
        </p>
        <p className="text-xs text-neutral-400 mt-3">
          For data sourcing and pipeline details, see the{" "}
          <Link href="/methodology" className="underline hover:text-neutral-600">
            methodology
          </Link>
          .
        </p>
      </div>

      <div className="mx-auto max-w-3xl px-4 pb-16 space-y-12">
        {/* About the developer */}
        <section>
          <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-4">
            About the developer
          </h2>
          <div className="flex items-start gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/photos/trevor-brown.jpg"
              alt="Trevor Brown"
              className="w-20 h-20 rounded-full object-cover shrink-0"
            />
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
              political reporting, most recently six years covering elections,
              dark money, financial disclosures and government accountability
              at{" "}
              <a
                href="https://oklahomawatch.org"
                className="underline hover:text-neutral-900"
                target="_blank"
                rel="noopener noreferrer"
              >
                Oklahoma Watch
              </a>
              . This project bridges both worlds — journalism instinct driving
              a developer tool.
            </p>
          </div>
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
                href="https://www.opensecrets.org/trump/executive-branch"
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

        {/* Open source */}
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
            . The code, data pipeline and research are available on{" "}
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

        {/* Feedback */}
        <section className="border-t border-neutral-200 pt-8">
          <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-2">
            Report an issue
          </h2>
          <p className="text-neutral-500 text-sm mb-6">
            Found a data error, missing official or bug? We review every
            submission. Your feedback helps keep this tool accurate.
          </p>
          <FeedbackForm />
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
