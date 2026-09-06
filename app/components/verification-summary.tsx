import { STATE_LABEL, type RowVerificationFile, type VerificationState } from "@/lib/row-verification";

export default function VerificationSummary({
  summary: storedSummary,
}: {
  summary: RowVerificationFile["summary"] | null;
}) {
  // Older files predate the audit gate and give score 3 to program-only
  // agreements. They cannot support the current coverage claim.
  const summary = storedSummary && (Object.keys(STATE_LABEL) as VerificationState[])
    .every((state) => typeof storedSummary.byState[state] === "number") ? storedSummary : null;
  // "Checked" here means all three gates: an independent program (or a
  // second company's model), the model read, and the page audit; or a
  // person's decision.
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
            {" "}({share} percent) have passed every check: an independent program or a second company&rsquo;s model agreed, and a third company&rsquo;s model confirmed the row against the page image, or a person decided.
          </p>
          <ul className="space-y-2 text-sm text-neutral-600 mb-4">
            {(Object.keys(STATE_LABEL) as VerificationState[]).map((state) => (
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
