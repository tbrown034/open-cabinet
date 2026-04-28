import type { TickerReconciliation } from "@/lib/holdings";

interface Props {
  reconciliation: TickerReconciliation[];
  totalHoldingsCount: number;
  totalSales: number;
}

const STATUS_LABEL: Record<TickerReconciliation["status"], string> = {
  sold: "Sold",
  "no-sale-on-file": "No 278-T sale on file",
  exempt: "Exempt fund",
};

const STATUS_TONE: Record<TickerReconciliation["status"], string> = {
  sold: "text-emerald-700 bg-emerald-50 border-emerald-200",
  "no-sale-on-file": "text-amber-800 bg-amber-50 border-amber-200",
  exempt: "text-neutral-600 bg-neutral-100 border-neutral-200",
};

export default function HoldingsReconciliation({
  reconciliation,
  totalHoldingsCount,
  totalSales,
}: Props) {
  const sold = reconciliation.filter((r) => r.status === "sold").length;
  const unmatched = reconciliation.filter(
    (r) => r.status === "no-sale-on-file"
  ).length;
  const exempt = reconciliation.filter((r) => r.status === "exempt").length;

  return (
    <section className="mt-12 mb-12 border-t border-neutral-200 pt-10">
      <div className="flex items-baseline gap-3 mb-1">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
          Entry Holdings vs Trades on File
        </h2>
        <span className="text-[10px] uppercase tracking-wider text-amber-700 font-medium">
          Pilot
        </span>
      </div>
      <p className="text-sm text-neutral-600 leading-relaxed mb-1 max-w-2xl">
        Open Cabinet&rsquo;s first ingestion of a Nominee 278 entry-disclosure
        document. {totalHoldingsCount} holdings parsed across Parts 2, 5, and 6
        of the form; reconciled at the ticker level against {totalSales}{" "}
        sales filed via 278-T.
      </p>
      <p className="text-xs text-neutral-400 mb-6 max-w-2xl">
        This is a pilot. Ticker matching, descriptions, and item-number
        structure are reliable. Dollar-value buckets are still being refined
        because column wrapping in the source PDF interleaves values with
        adjacent columns &mdash; so values are intentionally not displayed
        yet.
      </p>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-neutral-500 mb-6">
        <span>
          <span className="text-emerald-700 font-semibold tabular-nums">
            {sold}
          </span>{" "}
          tickers with matching sale
        </span>
        <span>
          <span className="text-amber-700 font-semibold tabular-nums">
            {unmatched}
          </span>{" "}
          held with no 278-T sale on file
        </span>
        <span>
          <span className="text-neutral-500 font-semibold tabular-nums">
            {exempt}
          </span>{" "}
          exempt funds
        </span>
      </div>

      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wider text-neutral-500">
              <th className="py-2 pr-4 font-medium">Ticker</th>
              <th className="py-2 pr-4 font-medium">Description</th>
              <th className="py-2 pr-4 font-medium">Sales</th>
              <th className="py-2 pr-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {reconciliation.map((r) => (
              <tr key={r.ticker} className="border-b border-neutral-100 align-top">
                <td className="py-3 pr-4 font-[family-name:var(--font-dm-mono)] text-neutral-900">
                  {r.ticker}
                </td>
                <td className="py-3 pr-4 text-neutral-700">
                  {r.description}
                </td>
                <td className="py-3 pr-4 tabular-nums text-neutral-600">
                  {r.saleCount > 0 ? r.saleCount : <span className="text-neutral-300">&mdash;</span>}
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`inline-block px-2 py-0.5 text-[11px] border ${STATUS_TONE[r.status]}`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                  <p className="text-xs text-neutral-500 mt-1 max-w-md leading-snug">
                    {r.note}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-400 mt-6 max-w-2xl leading-relaxed">
        Source: Lutnick&rsquo;s January 24, 2025 Nominee 278 entry-disclosure
        filing. Parsed via natural-pdf section extraction with regex-based
        row interpretation. The reconciliation does not show full divestiture
        compliance &mdash; some sold positions may have used the Form 201
        Certificate of Divestiture channel (Lutnick has five such certificates,
        OGE-2025-070 through 074, which we do not yet ingest).
      </p>
    </section>
  );
}
