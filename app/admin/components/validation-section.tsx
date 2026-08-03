import type { DbValidationReport, OgeCheckReport } from "../types";

/** On-demand database validation and OGE polling, with result panels. */
export function ValidationSection({
  validationReport,
  ogeReport,
  validating,
  checkingOge,
  onValidate,
  onCheckOge,
}: {
  validationReport: DbValidationReport | null;
  ogeReport: OgeCheckReport | null;
  validating: boolean;
  checkingOge: boolean;
  onValidate: () => void;
  onCheckOge: () => void;
}) {
  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
          Data Validation
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onValidate}
            disabled={validating}
            className="text-xs bg-neutral-900 text-white px-3 py-1.5 hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            {validating ? "Running…" : "Validate DB"}
          </button>
          <button
            type="button"
            onClick={onCheckOge}
            disabled={checkingOge}
            className="text-xs border border-neutral-300 text-neutral-700 px-3 py-1.5 hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            {checkingOge ? "Checking…" : "Check OGE"}
          </button>
        </div>
      </div>
      {validationReport ? (
        <div
          className={`border px-4 py-3 text-sm ${validationReport.result === "PASS" ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`font-medium ${validationReport.result === "PASS" ? "text-emerald-700" : "text-red-700"}`}
            >
              {validationReport.result}
            </span>
            <span className="text-xs text-neutral-400">
              {validationReport.duration}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div>Officials: {validationReport.officials}</div>
            <div>Transactions: {validationReport.transactions}</div>
            <div>Needs review: {validationReport.needsReview}</div>
            <div>Issues: {validationReport.totalIssues}</div>
          </div>
          {validationReport.totalIssues > 0 && (
            <div className="mt-2 text-xs text-red-700">
              {Object.entries(validationReport.checks)
                .reduce<string[]>((parts, [k, v]) => {
                  if ((v as number) > 0) parts.push(`${k}: ${v}`);
                  return parts;
                }, [])
                .join(" | ")}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-neutral-400">
          Click {"\""}Validate DB{"\""} to check data integrity or {"\""}Check
          OGE{"\""} to poll for new filings.
        </p>
      )}

      {ogeReport && (
        <div
          className={`border px-4 py-3 text-sm mt-3 ${ogeReport.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`font-medium ${ogeReport.ok ? "text-emerald-700" : "text-red-700"}`}
            >
              {ogeReport.ok ? "OGE Check Complete" : "OGE Check Failed"}
            </span>
            {ogeReport.duration && (
              <span className="text-xs text-neutral-400">
                {ogeReport.duration}
              </span>
            )}
          </div>
          {ogeReport.totalOgeRecords && (
            <div className="text-xs text-neutral-600">
              Total OGE records: {ogeReport.totalOgeRecords.toLocaleString()} |
              Run #{ogeReport.runId}
            </div>
          )}
          {ogeReport.error && (
            <div className="text-xs text-red-700 mt-1">{ogeReport.error}</div>
          )}
        </div>
      )}
    </section>
  );
}
