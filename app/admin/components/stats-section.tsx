import type { AdminStats } from "../types";

/** Database mirror counts and recorded operational run costs. */
export function StatsSection({ stats }: { stats: AdminStats | null }) {
  if (!stats) return null;

  return (
    <section className="mb-12">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
        Database mirror and run records
      </h2>
      <p className="text-sm text-neutral-500 mb-4">
        These counts describe the older database copy. Public transaction pages
        read published JSON files, so their totals may differ. Recorded run cost
        covers only costs saved in this database, not all model spending.
      </p>
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
          <div className="text-xs text-neutral-500">mirror rows needing review</div>
        </div>
        <div className="border border-neutral-200 px-4 py-3">
          <div className="text-2xl font-semibold font-[family-name:var(--font-dm-mono)] text-neutral-900">
            ${stats.totalPipelineCost.toFixed(2)}
          </div>
          <div className="text-xs text-neutral-500">recorded run cost</div>
        </div>
      </div>
    </section>
  );
}
