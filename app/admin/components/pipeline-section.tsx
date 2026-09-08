import type { PipelineRun } from "../types";

/** Pipeline run instructions plus the run-history table. */
export function PipelineSection({ runs }: { runs: PipelineRun[] }) {
  return (
    <section className="mb-12">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
        Filing monitor and ingestion
      </h2>
      <div className="bg-stone-50 border border-neutral-200 p-4 mb-4 text-sm space-y-3">
        <div>
          <h3 className="text-neutral-900 font-medium text-xs mb-1">Daily monitor</h3>
          <p className="text-neutral-500 text-xs">
            Vercel Cron checks OGE at 10 AM UTC, records the result and sends admin
            notifications when needed. It discovers filings; it does not parse
            PDFs or update published transactions.
          </p>
        </div>
        <div>
          <h3 className="text-neutral-900 font-medium text-xs mb-1">Weekly ingestion</h3>
          <p className="text-neutral-500 text-xs">
            <a className="underline" href="https://github.com/tbrown034/open-cabinet/actions/workflows/oge-pipeline.yml">
              GitHub Actions
            </a>{" "}
            runs the JSON ingestion workflow on Mondays or on demand. It reads
            and checks PDFs, rebuilds supporting files and opens a pull request.
            Published data changes after review, merge and deployment.
          </p>
        </div>
        <div>
          <h3 className="text-neutral-900 font-medium text-xs mb-1">Manual work</h3>
          <p className="text-neutral-500 text-xs">
            <code>pnpm ingest-filings</code> is the current JSON ingestion command;
            it can make paid calls and write data. Read the{" "}
            <a className="underline" href="https://github.com/tbrown034/open-cabinet/blob/main/docs/maintenance.md">
              maintenance guide
            </a>{" "}
            before adding a filing or correcting an existing one. The older
            database pipeline is a separate workflow.
          </p>
        </div>
      </div>
      <p className="text-xs text-neutral-500 mb-4">
        History below contains runs recorded in PostgreSQL, including daily
        monitor checks and older database jobs. It is not the weekly ingestion
        history or a complete model-cost ledger. A monitor can complete with
        zero transactions because it only checks for filings.
      </p>

      {runs.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-neutral-900 text-xs uppercase tracking-wider text-neutral-500">
                <th className="pb-2 pr-3 font-medium">#</th>
                <th className="pb-2 pr-3 font-medium">When</th>
                <th className="pb-2 pr-3 font-medium">Status</th>
                <th className="pb-2 pr-3 font-medium text-right">
                  New filings
                </th>
                <th className="pb-2 pr-3 font-medium text-right">
                  Transactions
                </th>
                <th className="pb-2 pr-3 font-medium text-right">Cost</th>
                <th className="pb-2 font-medium text-right">Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-3 font-[family-name:var(--font-dm-mono)] text-neutral-400">
                    {run.id}
                  </td>
                  <td className="py-2 pr-3 text-neutral-600">
                    {new Date(run.ranAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`text-xs font-medium ${
                        run.status === "completed"
                          ? "text-emerald-700"
                          : run.status === "running"
                            ? "text-amber-700"
                            : "text-red-700"
                      }`}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {run.newFilingsFound}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {run.newTransactionsParsed}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums font-[family-name:var(--font-dm-mono)] text-neutral-500">
                    {run.tokenUsage
                      ? `$${run.tokenUsage.costUsd?.toFixed(3) || "0"}`
                      : "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums text-neutral-500">
                    {run.duration ? `${(run.duration / 1000).toFixed(0)}s` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-400">
          No monitor or database-job runs have been recorded yet.
        </p>
      )}
    </section>
  );
}
