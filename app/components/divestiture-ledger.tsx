import type {
  DivestitureData,
  PromiseEvidence,
  SourceDocument,
} from "@/lib/divestiture";
import { formatDate, formatCompactCurrency } from "@/lib/format";

interface Props {
  data: DivestitureData;
  evidence: PromiseEvidence[];
}

const DOC_BADGE: Record<SourceDocument["kind"], string> = {
  nominee_278: "Nominee 278",
  ethics_agreement: "Ethics Agreement",
  compliance_cert: "Compliance Cert",
  transaction_reports: "278-T",
};

export default function DivestitureLedger({ data, evidence }: Props) {
  const totalPromises = evidence.length;
  const promisesWithSales = evidence.filter(
    (e) => e.status === "sales-on-file"
  ).length;
  const promisesWithoutSales = totalPromises - promisesWithSales;

  return (
    <section className="mt-12 mb-12 border-t border-neutral-200 pt-10">
      <div className="flex items-baseline gap-3 mb-1">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
          Divestiture: promises, filings, OGE certification
        </h2>
        <span className="text-[10px] uppercase tracking-wider text-amber-700 font-medium">
          Pilot
        </span>
      </div>

      <p className="text-sm text-neutral-700 leading-relaxed mb-2 max-w-2xl">
        {data.displayName} promised the Office of Government Ethics he would
        divest <span className="tabular-nums">{totalPromises}</span> specific
        holdings &mdash; most within 90 days of his February 18, 2025
        confirmation (deadline {formatDate(data.deadline90Days)}), the
        remainder &ldquo;as soon as practicable.&rdquo; 278-T sales are on
        file for <span className="tabular-nums">{promisesWithSales}</span>{" "}
        of those entities; no matching sale on file for{" "}
        <span className="tabular-nums">{promisesWithoutSales}</span>. OGE
        certified compliance on {formatDate(data.complianceVerdict.certifiedDate)}.
      </p>
      <p className="text-xs text-neutral-500 mb-6 max-w-2xl">
        OGE compliance certifications are issued by the Office of Government
        Ethics, not by Open Cabinet. The presence of a 278-T sale is
        documentary evidence that a transaction was reported; it is not a
        finding that the official complied. Absence of a 278-T sale may mean
        the holding was sold via a Form 201 Certificate of Divestiture (which
        we do not yet ingest), sold below the $1,000 reporting threshold, or
        not sold.
      </p>

      {/* SOURCE DOCUMENTS */}
      <div className="mb-8 border border-neutral-200 bg-stone-50 px-5 py-4">
        <div className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-3">
          Source documents
        </div>
        <ul className="space-y-2">
          {data.sourceDocuments.map((doc, i) => (
            <li key={i} className="text-sm flex items-baseline gap-3">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-mono w-28 shrink-0">
                {DOC_BADGE[doc.kind]}
              </span>
              <div className="flex-1">
                {doc.pdfPath ? (
                  <a
                    href={doc.pdfPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-neutral-900 underline hover:text-neutral-700 font-medium"
                  >
                    {doc.title}
                  </a>
                ) : (
                  <a
                    href={doc.ogeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-neutral-900 underline hover:text-neutral-700 font-medium"
                  >
                    {doc.title}
                  </a>
                )}{" "}
                <span className="text-neutral-500">
                  &middot; filed {formatDate(doc.filedDate)}
                </span>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {doc.subtitle}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* OGE EXCERPT */}
      <div className="mb-8 border-l-2 border-neutral-300 pl-5 py-1">
        <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-2">
          From the Compliance Certification
        </p>
        <blockquote className="text-sm text-neutral-700 italic leading-relaxed mb-2">
          &ldquo;{data.complianceVerdict.keyExcerpt}&rdquo;
        </blockquote>
        <p className="text-xs text-neutral-500">
          {data.complianceVerdict.excerptSource}
        </p>
        <p className="text-xs text-neutral-500 mt-2">
          {data.complianceVerdict.summary}
        </p>
      </div>

      {/* PROMISE LEDGER */}
      <div className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-3">
        Promise ledger
      </div>
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wider text-neutral-500">
              <th className="py-2 pr-4 font-medium align-bottom">Entity</th>
              <th className="py-2 pr-4 font-medium align-bottom">Section</th>
              <th className="py-2 pr-4 font-medium align-bottom">Promised action</th>
              <th className="py-2 pr-4 font-medium align-bottom">Sales on file (278-T)</th>
              <th className="py-2 pr-4 font-medium align-bottom whitespace-nowrap">Earliest sale</th>
            </tr>
          </thead>
          <tbody>
            {evidence.map((e) => (
              <tr
                key={e.promise.entity}
                className="border-b border-neutral-100 align-top"
              >
                <td className="py-3 pr-4 font-medium text-neutral-900">
                  {e.promise.entity}
                  {e.promise.ticker && (
                    <span className="ml-2 text-xs text-neutral-500 font-[family-name:var(--font-dm-mono)]">
                      {e.promise.ticker}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4 text-xs text-neutral-500 whitespace-nowrap">
                  {e.promise.section}
                </td>
                <td className="py-3 pr-4 text-xs text-neutral-700 leading-snug max-w-md">
                  {e.promise.action}
                </td>
                <td className="py-3 pr-4">
                  {e.matchingSales.length > 0 ? (
                    <div>
                      <span className="font-[family-name:var(--font-dm-mono)] tabular-nums text-neutral-900">
                        {e.matchingSales.length}
                      </span>{" "}
                      <span className="text-xs text-neutral-500">
                        sale{e.matchingSales.length === 1 ? "" : "s"} &middot;{" "}
                        ~{formatCompactCurrency(e.saleVolumeMidpoint)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5">
                      No 278-T sale on file
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4 text-xs text-neutral-600 tabular-nums whitespace-nowrap">
                  {e.earliestSaleDate ? formatDate(e.earliestSaleDate) : (
                    <span className="text-neutral-300">&mdash;</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* RETAINED POSITIONS NOTE */}
      <div className="mt-8 text-xs text-neutral-500 leading-relaxed max-w-2xl">
        <span className="text-neutral-700 font-medium">Retained positions:</span>{" "}
        {data.retainedPositions.summary}
      </div>

      {/* FOOTER */}
      <p className="text-xs text-neutral-400 mt-6 max-w-2xl leading-relaxed">
        Sources: Office of Government Ethics financial disclosure portal. The
        Ethics Agreement also lists hundreds of subsidiary entities of Cantor
        Fitzgerald, BGC Group, and Newmark Group in Appendix A — those are
        positions Lutnick committed to resign from, not individually-traded
        stocks, and are not shown in this ledger. For the full list see the
        Ethics Agreement PDF above.
      </p>
    </section>
  );
}
