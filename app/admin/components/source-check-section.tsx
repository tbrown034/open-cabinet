import type { OgeCheckReport } from "../types";

/** Run the daily filing monitor on demand and show its result. */
export function SourceCheckSection({
  ogeReport,
  checkingOge,
  onCheckOge,
}: {
  ogeReport: OgeCheckReport | null;
  checkingOge: boolean;
  onCheckOge: () => void;
}) {
  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
          Source check
        </h2>
        <div className="flex gap-2">
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
      <p className="text-sm text-neutral-500 mb-4">
        Check OGE polls for new filings, records a monitor run and may send an
        admin notification. It does not import transactions. Published JSON is
        checked separately with <code>pnpm validate</code>.
      </p>

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
          {ogeReport.totalOgeRecords !== undefined && (
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
