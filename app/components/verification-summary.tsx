import { STATE_LABEL, type RowVerificationFile, type VerificationState } from "@/lib/row-verification";

export default function VerificationSummary({
  summary,
}: {
  summary: RowVerificationFile["summary"] | null;
}) {
  const checked = summary ? summary.byScore["3"] + summary.byScore["2"] : 0;
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
            {" "}({share} percent) are checked by an independent program, a person or two models.
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
        <p className="text-neutral-600 leading-relaxed">Row verification counts are not yet available.</p>
      )}
    </section>
  );
}
