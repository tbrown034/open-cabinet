"use client";

/**
 * ViewToggle, segmented control for switching between the monthly
 * bars chart (good for density at a glance) and the dot timeline
 * (every trade visible, sized by amount). Both views encode the same
 * data; the toggle is honest about the tradeoff: aggregate vs. atomic.
 *
 * URL param: ?view=bars | dots. Persists so a link is deterministic.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

export type ChartView = "bars" | "dots";

/**
 * Hints name what the mark IS, not just the unit. Without that the toggle
 * reads as a skin swap, when in fact the two views answer different
 * questions: how big was each trade, versus when did the trading happen.
 */
const VIEW_OPTIONS: { value: ChartView; label: string; hint: string }[] = [
  {
    value: "dots",
    label: "Every trade",
    hint: "One dot per disclosure, sized by reported amount",
  },
  {
    value: "bars",
    label: "By month",
    hint: "One bar per month, sized by number of trades",
  },
];

export default function ViewToggle(props: {
  selected: ChartView;
  /**
   * The view this page falls back to with no ?view= param. Dots for most
   * officials, bars for the high-volume ones. The toggle has to know it:
   * clearing the param on a page that defaults to bars would bounce the
   * reader straight back to bars and make the control look broken.
   */
  defaultView: ChartView;
}) {
  return (
    <Suspense fallback={null}>
      <ViewToggleContent {...props} />
    </Suspense>
  );
}

function ViewToggleContent({
  selected,
  defaultView,
}: {
  selected: ChartView;
  defaultView: ChartView;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const pathname = usePathname();

  function pick(v: ChartView) {
    const params = new URLSearchParams(search.toString());
    // Only the page's own default can be left implicit.
    if (v === defaultView) params.delete("view");
    else params.set("view", v);
    const qs = params.toString();
    // Replace with a full path, not a bare "?query". The relative form
    // silently no-ops on this dynamic route, which left the toggle looking
    // hydrated but inert — clicking it changed neither URL nor chart.
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
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
