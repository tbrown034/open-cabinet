import type { TickerReconciliation } from "@/lib/holdings";
import { formatCompactCurrency } from "@/lib/format";

interface Props {
  reconciliation: TickerReconciliation[];
  // Sum of sale-transaction midpoints for tickers that match an entry holding.
  // We have this number reliably from existing 278-T data.
  matchedSalesValue: number;
}

const STATUS_FILL: Record<TickerReconciliation["status"], string> = {
  sold: "#15803d",          // emerald-700
  "no-sale-on-file": "#b45309", // amber-700
  exempt: "#a8a29e",        // stone-400
};

const STATUS_BG: Record<TickerReconciliation["status"], string> = {
  sold: "bg-emerald-50 border-emerald-200",
  "no-sale-on-file": "bg-amber-50 border-amber-200",
  exempt: "bg-stone-100 border-stone-200",
};

export default function DivestitureFlow({
  reconciliation,
  matchedSalesValue,
}: Props) {
  const total = reconciliation.length;
  const sold = reconciliation.filter((r) => r.status === "sold");
  const unmatched = reconciliation.filter((r) => r.status === "no-sale-on-file");
  const exempt = reconciliation.filter((r) => r.status === "exempt");

  // Each ticker is one segment of equal width — we explicitly do not weight by
  // dollar value because the entry-holdings value buckets are not yet reliable
  // (parser limitation called out in the methodology). Equal-width segments
  // are an honest "position count" visual.

  return (
    <section className="mt-12 mb-12 border-t border-neutral-200 pt-10">
      <div className="flex items-baseline gap-3 mb-1">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
          Divestiture flow
        </h2>
        <span className="text-[10px] uppercase tracking-wider text-amber-700 font-medium">
          Pilot
        </span>
      </div>
      <p className="text-sm text-neutral-600 leading-relaxed mb-6 max-w-2xl">
        Of the {total} individually-tracked stock positions disclosed on
        Lutnick&rsquo;s Nominee 278 entry filing, here is what shows up in
        the 278-T sales record so far.
      </p>

      {/* TOP — entry portfolio bar (one segment per ticker) */}
      <div className="mb-2">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs uppercase tracking-wider text-neutral-500">
            Entry portfolio &mdash; {total} stock positions
          </span>
        </div>
        <div className="flex h-10 w-full overflow-hidden border border-neutral-200">
          {reconciliation.map((r, i) => (
            <div
              key={r.ticker}
              className="flex-1 flex items-center justify-center text-[10px] font-medium text-white tabular-nums border-r border-white/30 last:border-r-0"
              style={{ backgroundColor: STATUS_FILL[r.status] }}
              title={`${r.ticker} — ${r.status === "sold" ? "Sold" : r.status === "no-sale-on-file" ? "No sale on file" : "Exempt fund"}`}
            >
              {/* Show ticker label only if there's room */}
              {total <= 14 ? r.ticker : i % 2 === 0 ? r.ticker : ""}
            </div>
          ))}
        </div>
      </div>

      {/* CONNECTOR — visual flow indication */}
      <div className="flex justify-center my-3">
        <svg width="100%" height="32" viewBox="0 0 600 32" preserveAspectRatio="none" className="max-w-2xl">
          {/* Three diverging arrows that show one bar splitting into three */}
          <path d="M 100 0 L 100 32" stroke="#15803d" strokeWidth="2" fill="none" />
          <path d="M 300 0 L 300 32" stroke="#b45309" strokeWidth="2" fill="none" />
          <path d="M 500 0 L 500 32" stroke="#a8a29e" strokeWidth="2" fill="none" />
        </svg>
      </div>

      {/* BOTTOM — three outcome cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`border p-4 ${STATUS_BG.sold}`}>
          <div className="text-xs uppercase tracking-wider text-emerald-800 font-medium mb-1">
            Sold via 278-T
          </div>
          <div className="font-[family-name:var(--font-dm-mono)] text-2xl text-emerald-900 tabular-nums mb-1">
            {sold.length}
          </div>
          <div className="text-xs text-emerald-800 mb-2">
            position{sold.length === 1 ? "" : "s"} matched to a sale on file
          </div>
          <div className="text-[11px] text-emerald-700">
            ~{formatCompactCurrency(matchedSalesValue)} in disclosed sale volume
            from these tickers
          </div>
          <div className="text-[10px] text-emerald-700/70 mt-2 leading-snug">
            {sold.map((s) => s.ticker).join(", ")}
          </div>
        </div>

        <div className={`border p-4 ${STATUS_BG["no-sale-on-file"]}`}>
          <div className="text-xs uppercase tracking-wider text-amber-800 font-medium mb-1">
            No 278-T sale on file
          </div>
          <div className="font-[family-name:var(--font-dm-mono)] text-2xl text-amber-900 tabular-nums mb-1">
            {unmatched.length}
          </div>
          <div className="text-xs text-amber-800 mb-2">
            position{unmatched.length === 1 ? "" : "s"} held at entry without
            a matching sale
          </div>
          <div className="text-[11px] text-amber-700">
            May be still held, sold via Form 201 channel, or below the
            $1,000 reporting threshold
          </div>
          <div className="text-[10px] text-amber-700/70 mt-2 leading-snug">
            {unmatched.map((s) => s.ticker).join(", ")}
          </div>
        </div>

        <div className={`border p-4 ${STATUS_BG.exempt}`}>
          <div className="text-xs uppercase tracking-wider text-neutral-700 font-medium mb-1">
            Exempt fund
          </div>
          <div className="font-[family-name:var(--font-dm-mono)] text-2xl text-neutral-900 tabular-nums mb-1">
            {exempt.length}
          </div>
          <div className="text-xs text-neutral-700 mb-2">
            position{exempt.length === 1 ? "" : "s"} statutorily exempt from
            278-T reporting
          </div>
          <div className="text-[11px] text-neutral-600">
            Diversified mutual funds and money-market funds (5 CFR &sect;2640.201)
          </div>
          <div className="text-[10px] text-neutral-600/70 mt-2 leading-snug">
            {exempt.map((s) => s.ticker).join(", ")}
          </div>
        </div>
      </div>

      <p className="text-xs text-neutral-400 mt-6 max-w-2xl leading-relaxed">
        Equal-width segments represent position count, not dollar value. The
        entry-holdings value buckets in the source PDF are still being parsed
        column-aware; once that lands, this view will weight by dollar amount.
        The $474.9M sale-volume figure is taken directly from Lutnick&rsquo;s
        existing 278-T transactions and is unaffected by the holdings parser.
      </p>
    </section>
  );
}
