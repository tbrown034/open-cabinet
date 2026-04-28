import type {
  SourceDocumentsData,
  DocumentKind,
} from "@/lib/source-docs";
import { formatDate } from "@/lib/format";

interface Props {
  data: SourceDocumentsData;
}

const KIND_LABEL: Record<DocumentKind, string> = {
  nominee_278: "Nominee 278",
  ethics_agreement: "Ethics Agreement",
  compliance_cert: "Compliance Certification",
  transaction_278t: "278-T Periodic Transaction Report",
  certificate_of_divestiture: "Certificate of Divestiture",
  conflict_waiver: "Conflict of Interest Waiver",
  other: "Other",
};

const FORM_201_REQUEST_URL = "https://extapps2.oge.gov/201/Presiden.nsf/201%20Request?OpenForm";

export default function SourceDocuments({ data }: Props) {
  const publicCount = data.documents.filter((d) => d.publiclyDownloadable).length;
  const form201Count = data.documents.length - publicCount;

  return (
    <section className="mt-12 mb-12 border-t border-neutral-200 pt-10">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-1">
        Source documents on file with OGE
      </h2>
      <p className="text-sm text-neutral-600 leading-relaxed mb-6 max-w-2xl">
        Every financial disclosure document the Office of Government Ethics
        has published or recorded for {data.displayName}. Open Cabinet
        summarizes each document observationally and links to the source PDF
        where one is publicly available. We do not issue compliance verdicts
        &mdash; that is OGE&rsquo;s role, not ours.
      </p>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-500 mb-6">
        <span>
          <span className="text-neutral-900 font-semibold tabular-nums">
            {data.documents.length}
          </span>{" "}
          document{data.documents.length === 1 ? "" : "s"} listed
        </span>
        <span>
          <span className="text-neutral-900 font-semibold tabular-nums">
            {publicCount}
          </span>{" "}
          publicly downloadable
        </span>
        {form201Count > 0 && (
          <span>
            <span className="text-amber-800 font-semibold tabular-nums">
              {form201Count}
            </span>{" "}
            require{form201Count === 1 ? "s" : ""}{" "}
            <a
              href={FORM_201_REQUEST_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-neutral-900"
            >
              Form 201 request
            </a>
          </span>
        )}
      </div>

      <ul className="divide-y divide-neutral-200 border-t border-b border-neutral-200">
        {data.documents.map((doc, i) => (
          <li key={i} className="py-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
                {KIND_LABEL[doc.kind]}
              </span>
              {doc.publiclyDownloadable && doc.pdfPath ? (
                <a
                  href={doc.pdfPath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-neutral-900 underline hover:text-neutral-700 font-medium"
                >
                  {doc.title}
                </a>
              ) : (
                <span className="text-sm text-neutral-900 font-medium">
                  {doc.title}
                </span>
              )}
              <span className="text-xs text-neutral-500">
                &middot; filed {formatDate(doc.filedDate)}
              </span>
              {!doc.publiclyDownloadable && (
                <span className="text-[10px] uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5">
                  Form 201 only
                </span>
              )}
            </div>
            <p className="text-sm text-neutral-700 leading-relaxed">
              {doc.summary}
            </p>
            <div className="text-xs text-neutral-400 mt-2 flex flex-wrap gap-x-4">
              <a
                href={doc.ogeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-neutral-600"
              >
                OGE record
              </a>
              {!doc.publiclyDownloadable && (
                <a
                  href={FORM_201_REQUEST_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-neutral-600"
                >
                  Request via Form 201
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* PROPUBLICA CROSS-CHECK */}
      {data.propublicaCheck.url && (
        <div className="mt-6 text-xs text-neutral-500 leading-relaxed">
          <span className="text-neutral-700 font-medium">Cross-check:</span>{" "}
          ProPublica&rsquo;s Trump Team Financial Disclosures database lists{" "}
          {data.propublicaCheck.filingsListedThere ?? "an unknown number of"}{" "}
          filings for this official.{" "}
          {data.propublicaCheck.discrepancies && (
            <span>{data.propublicaCheck.discrepancies}{" "}</span>
          )}
          <a
            href={data.propublicaCheck.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-neutral-900"
          >
            View ProPublica record
          </a>
          .
        </div>
      )}

      <p className="text-xs text-neutral-400 mt-4 leading-relaxed max-w-2xl">
        Source: U.S. Office of Government Ethics public disclosure portal.
        Document summaries are observational and do not constitute compliance
        determinations. Compliance with ethics agreements is certified by OGE
        in their own Compliance Certification document, which is listed above
        when on file.
      </p>
    </section>
  );
}
