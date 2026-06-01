"use client";

/**
 * ViewToggle, segmented control for switching between the monthly
 * bars chart (good for density at a glance) and the dot timeline
 * (every trade visible, sized by amount). Both views encode the same
 * data; the toggle is honest about the tradeoff: aggregate vs. atomic.
 *
 * URL param: ?view=bars | dots. Persists so a link is deterministic.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

export type ChartView = "bars" | "dots";

const VIEW_OPTIONS: { value: ChartView; label: string; hint: string }[] = [
  {
    value: "bars",
    label: "Monthly bars",
    hint: "Density at a glance",
  },
  {
    value: "dots",
    label: "Every trade",
    hint: "One dot per transaction",
  },
];

export default function ViewToggle(props: { selected: ChartView }) {
  return (
    <Suspense fallback={null}>
      <ViewToggleContent {...props} />
    </Suspense>
  );
}

function ViewToggleContent({ selected }: { selected: ChartView }) {
  const router = useRouter();
  const search = useSearchParams();

  function pick(v: ChartView) {
    const params = new URLSearchParams(search.toString());
    if (v === "bars") params.delete("view");
    else params.set("view", v);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  return (
    <div
      className="inline-flex border border-neutral-200 text-xs"
      role="tablist"
      aria-label="Chart view"
    >
      {VIEW_OPTIONS.map((o) => {
        const isActive = o.value === selected;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => pick(o.value)}
            title={o.hint}
            className={`px-2.5 py-1 transition-colors ${
              isActive
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-600 hover:text-neutral-900"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
