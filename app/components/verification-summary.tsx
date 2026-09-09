import { STATE_LABEL, type RowVerificationFile, type VerificationState } from "@/lib/row-verification";

export default function VerificationSummary({
  summary: storedSummary,
  generatedAt,
}: {
  summary: RowVerificationFile["summary"] | null;
  generatedAt?: string;
}) {
  const summary = storedSummary && (Object.keys(STATE_LABEL) as VerificationState[])
    .every((state) => typeof storedSummary.byState[state] === "number") ? storedSummary : null;
  const checked = summary ? summary.byScore["3"] : 0;
  const share = summary?.rows
    ? ((checked / summary.rows) * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })
    : "0";

  return (
    <section className="border-t border-neutral-200 pt-8">
      <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-4">
        How much of the data has been checked
      </h2>
      {summary ? (
        <>
          <p className="text-neutral-600 leading-relaxed mb-4">
            {checked.toLocaleString("en-US")} of {summary.rows.toLocaleString("en-US")} rows
            {" "}({share} percent) have a recorded checked status for their trade columns: type, date, amount and late flag.
          </p>
          {generatedAt ? (
            <p className="text-sm text-neutral-500 mb-4">
              Verification records last rebuilt <time dateTime={generatedAt}>{generatedAt.slice(0, 10)}</time> (UTC).
              These are saved results; this page does not rerun the checks.
            </p>
          ) : null}
          <p className="text-neutral-600 leading-relaxed mb-4">
            &ldquo;Checked&rdquo; means an independent program or a second
            provider&rsquo;s model agreed with the first read, or a person compared
            the row to the PDF.
            Company names and ticker symbols have separate checks. A public
            ticker also requires a matching independent name read or a recorded human decision.
          </p>
          <ul className="space-y-2 text-sm text-neutral-600 mb-4">
            {(Object.keys(STATE_LABEL) as VerificationState[]).filter((state) => summary.byState[state] > 0).map((state) => (
              <li key={state}>
                <strong className="text-neutral-900">{summary.byState[state].toLocaleString("en-US")} rows</strong>
                {" "}— {STATE_LABEL[state]}.
              </li>
            ))}
          </ul>
          <p className="text-neutral-600 leading-relaxed">
            &ldquo;Not yet checked&rdquo; rows come from one model read with no independent comparison yet.
            {" "}&ldquo;Under review&rdquo; rows are on the site while a person decides.
          </p>
        </>
      ) : (
        <p className="text-neutral-600 leading-relaxed">{storedSummary
          ? "Row verification counts need rebuilding for the current checks."
          : "Row verification counts are not yet available."}</p>
      )}
    </section>
  );
}
