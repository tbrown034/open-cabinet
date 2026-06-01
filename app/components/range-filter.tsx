"use client";

/**
 * RangeFilter, segmented control for narrowing a transaction set to a
 * subrange. Persists the choice to the URL via `?range=ytd|12mo|all` so
 * a link to a filtered view is deterministic. No client-side fetch; the
 * caller re-derives the visible transactions from `selected`.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

export type Range = "ytd" | "12mo" | "all";

interface Props {
  selected: Range;
  available?: Range[];
  className?: string;
}

const LABELS: Record<Range, string> = {
  ytd: "YTD",
  "12mo": "12 months",
  all: "All filings",
};

export default function RangeFilter(props: Props) {
  return (
    <Suspense fallback={null}>
      <RangeFilterContent {...props} />
    </Suspense>
  );
}

function RangeFilterContent({ selected, available, className }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const opts = available ?? (["ytd", "12mo", "all"] as Range[]);

  function pick(r: Range) {
    const params = new URLSearchParams(search.toString());
    params.set("range", r);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  return (
    <div
      className={`inline-flex border border-neutral-200 text-xs ${
        className ?? ""
      }`}
      role="tablist"
      aria-label="Time range"
    >
      {opts.map((r) => {
        const isActive = r === selected;
        return (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => pick(r)}
            className={`px-2.5 py-1 transition-colors ${
              isActive
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-600 hover:text-neutral-900"
            }`}
          >
            {LABELS[r]}
          </button>
        );
      })}
    </div>
  );
}
