import type { AdminStats } from "../types";

/** Top-of-page database counters: officials, transactions, review backlog, cost. */
export function StatsSection({ stats }: { stats: AdminStats | null }) {
  if (!stats) return null;

  return (
    <section className="mb-12">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
        Database
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="border border-neutral-200 px-4 py-3">
          <div className="text-2xl font-semibold font-[family-name:var(--font-dm-mono)] text-neutral-900">
            {stats.officials}
          </div>
          <div className="text-xs text-neutral-500">officials</div>
        </div>
        <div className="border border-neutral-200 px-4 py-3">
          <div className="text-2xl font-semibold font-[family-name:var(--font-dm-mono)] text-neutral-900">
            {stats.transactions.toLocaleString()}
          </div>
          <div className="text-xs text-neutral-500">transactions</div>
        </div>
        <div className="border border-neutral-200 px-4 py-3">
          <div className="text-2xl font-semibold font-[family-name:var(--font-dm-mono)] text-neutral-900">
            {stats.newsArticles}
          </div>
          <div className="text-xs text-neutral-500">news articles</div>
        </div>
        <div className="border border-neutral-200 px-4 py-3">
          <div
            className={`text-2xl font-semibold font-[family-name:var(--font-dm-mono)] ${stats.needsReview > 0 ? "text-amber-700" : "text-neutral-900"}`}
          >
            {stats.needsReview}
          </div>
          <div className="text-xs text-neutral-500">needs review</div>
        </div>
        <div className="border border-neutral-200 px-4 py-3">
          <div className="text-2xl font-semibold font-[family-name:var(--font-dm-mono)] text-neutral-900">
            ${stats.totalPipelineCost.toFixed(2)}
          </div>
          <div className="text-xs text-neutral-500">pipeline cost</div>
        </div>
      </div>
    </section>
  );
}
