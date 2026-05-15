"use client";

/**
 * TransactionFilters — pill row above an official's chart/table for
 * narrowing the visible set without leaving the page. Each pill writes
 * to a URL param (?type=, ?month=, ?late=) so a journalist can link
 * directly to a filtered view like
 * /officials/trump-donald-j?range=12mo&type=sale&month=2026-03&late=1.
 *
 * The parent server component reads the same params and filters its
 * transactions accordingly — see the official detail page.
 */
import { useRouter, useSearchParams } from "next/navigation";

export type TxTypeFilter = "all" | "sale" | "purchase" | "late";

interface Props {
  type: TxTypeFilter;
  monthKey: string | null; // "YYYY-MM" or null for full range
  monthLabel: string | null; // pretty form, e.g. "March 2026"
  totalCount: number;
  filteredCount: number;
}

export default function TransactionFilters({
  type,
  monthKey,
  monthLabel,
  totalCount,
  filteredCount,
}: Props) {
  const router = useRouter();
  const search = useSearchParams();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(search.toString());
    if (value === null || value === "" || value === "all") params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  function clearMonth() {
    setParam("month", null);
  }

  const pills: { label: string; value: TxTypeFilter }[] = [
    { label: "All", value: "all" },
    { label: "Sales", value: "sale" },
    { label: "Purchases", value: "purchase" },
    { label: "Late-filed", value: "late" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <span className="text-[10px] uppercase tracking-wider text-neutral-500 mr-1">
        Filter
      </span>
      <div className="inline-flex border border-neutral-200 text-xs">
        {pills.map((p) => {
          const active = type === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => setParam("type", p.value)}
              className={`px-2.5 py-1 transition-colors ${
                active
                  ? "bg-neutral-900 text-white"
                  : "bg-white text-neutral-600 hover:text-neutral-900"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {monthKey && monthLabel && (
        <button
          type="button"
          onClick={clearMonth}
          className="inline-flex items-center gap-1.5 border border-neutral-900 bg-neutral-900 text-white text-xs px-2 py-1 hover:bg-neutral-800 transition-colors"
          title="Clear month filter"
        >
          <span>{monthLabel}</span>
          <span aria-hidden="true">×</span>
        </button>
      )}

      <span className="text-xs text-neutral-400 ml-auto">
        {filteredCount.toLocaleString()}
        {filteredCount !== totalCount &&
          ` of ${totalCount.toLocaleString()}`}{" "}
        trade{filteredCount === 1 ? "" : "s"}
      </span>
    </div>
  );
}
