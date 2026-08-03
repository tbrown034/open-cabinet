import type { PipelineRun } from "../types";

/** Pipeline run instructions plus the run-history table. */
export function PipelineSection({ runs }: { runs: PipelineRun[] }) {
  return (
    <section className="mb-12">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
        Pipeline Status
      </h2>
      <div className="bg-stone-50 border border-neutral-200 p-4 mb-4 text-sm space-y-3">
        <div>
          <div className="text-neutral-900 font-medium text-xs mb-1">
            Automated
          </div>
          <p className="text-neutral-500 text-xs">
            Runs daily (10 AM UTC) via Vercel Cron. Can also be triggered from
            the{" "}
            <a
              href="https://vercel.com/tbrown034s-projects/open-cabinet/settings/cron-jobs"
              className="underline hover:text-neutral-900"
              target="_blank"
              rel="noopener noreferrer"
            >
              Vercel dashboard
            </a>{" "}
            or locally with the commands below.
          </p>
        </div>
        <div>
          <div className="text-neutral-900 font-medium text-xs mb-1">
            Manual (local)
          </div>
          <div className="flex flex-wrap gap-2">
            <code className="text-[11px] font-[family-name:var(--font-dm-mono)] bg-neutral-200 px-2 py-1">
              pnpm run pipeline
            </code>
            <code className="text-[11px] font-[family-name:var(--font-dm-mono)] bg-neutral-200 px-2 py-1">
              pnpm run pipeline -- --dry-run
            </code>
            <code className="text-[11px] font-[family-name:var(--font-dm-mono)] bg-neutral-200 px-2 py-1">
              pnpm run pipeline -- --verify
            </code>
          </div>
        </div>
        <div>
          <div className="text-neutral-900 font-medium text-xs mb-1">
            Other commands
          </div>
          <div className="flex flex-wrap gap-2">
            <code className="text-[11px] font-[family-name:var(--font-dm-mono)] bg-neutral-200 px-2 py-1">
              pnpm run validate
            </code>
            <code className="text-[11px] font-[family-name:var(--font-dm-mono)] bg-neutral-200 px-2 py-1">
              pnpm run check-news
            </code>
            <code className="text-[11px] font-[family-name:var(--font-dm-mono)] bg-neutral-200 px-2 py-1">
              pnpm run parse-pdf &lt;file&gt;
            </code>
          </div>
        </div>
      </div>

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
          No pipeline runs yet. Run{" "}
          <code className="font-[family-name:var(--font-dm-mono)] bg-neutral-100 px-1">
            pnpm run pipeline
          </code>{" "}
          to start.
        </p>
      )}
    </section>
  );
}
