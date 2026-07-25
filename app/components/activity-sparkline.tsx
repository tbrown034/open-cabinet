import {
  formatMonthLong,
  peakMonthlyCount,
  type MonthBucket,
} from "@/lib/monthly-activity";

/**
 * Per-official monthly activity, one row of the directory table.
 *
 * The fixed viewBox paired with width="100%" and preserveAspectRatio="none"
 * is what makes this responsive with no JS and no resize observer: the height
 * matches the viewBox height exactly, so bar heights stay truthful while the
 * horizontal axis stretches from a 670px desktop column to full-bleed on a
 * phone.
 */

const VIEW_W = 640;
const VIEW_H = 30;
const MIDLINE_Y = VIEW_H / 2;
// Leaves 2px of breathing room at top and bottom so the tallest bar in a row
// does not touch the row divider.
const MAX_BAR_H = MIDLINE_Y - 2;
/**
 * Any month with at least one trade draws at least this tall.
 *
 * The chart's whole claim is that it shows *when* an official traded. Under
 * plain proportional heights an official like Mody — 306 trades, most of them
 * in one month — rendered a single bar and read as having traded once, which
 * is the opposite of true. The floor guarantees a quiet month is still a
 * visible mark.
 */
const MIN_BAR_H = 1;

/**
 * Inauguration fell on January 20, 2025 — roughly two-thirds through the
 * first bucket, not at its left edge. Placing the rule at the true position
 * inside the slot keeps it from being mistaken for a chart border.
 */
const INAUGURATION_SLOT_FRACTION = 19 / 31;

/**
 * Square-root heights, matching the hero thumbnail and the site's existing
 * monthly convention. Linear heights let one heavy month flatten every other
 * month in the row into nothing.
 */
function barHeight(count: number, peak: number): number {
  if (count <= 0) return 0;
  return Math.max((Math.sqrt(count) / Math.sqrt(peak)) * MAX_BAR_H, MIN_BAR_H);
}

function buildAriaLabel(buckets: MonthBucket[]): string {
  const active = buckets.filter((b) => b.sales + b.purchases > 0);
  if (active.length === 0) {
    return "No disclosed trades in the charted period.";
  }
  const first = formatMonthLong(active[0].monthKey);
  const last = formatMonthLong(active[active.length - 1].monthKey);
  const span = `Traded in ${active.length} of ${buckets.length} months`;
  return active.length === 1
    ? `${span}, ${first}.`
    : `${span}, first ${first}, most recently ${last}.`;
}

export default function ActivitySparkline({
  buckets,
}: {
  buckets: MonthBucket[];
}) {
  const monthCount = Math.max(buckets.length, 1);
  const slotWidth = VIEW_W / monthCount;
  const barWidth = slotWidth * 0.72;

  // Per-row normalization: every row scales to its own busiest month. A scale
  // shared across rows would flatten all 34 non-Trump officials into a line.
  // The caption under the table carries this caveat — without it a reader
  // reads height as volume.
  const peak = peakMonthlyCount(buckets);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      height={VIEW_H}
      preserveAspectRatio="none"
      role="img"
      aria-label={buildAriaLabel(buckets)}
      style={{ display: "block" }}
    >
      <line
        x1={0}
        y1={MIDLINE_Y}
        x2={VIEW_W}
        y2={MIDLINE_Y}
        stroke="#e5e5e5"
        strokeWidth={0.7}
      />

      <line
        x1={slotWidth * INAUGURATION_SLOT_FRACTION}
        y1={0}
        x2={slotWidth * INAUGURATION_SLOT_FRACTION}
        y2={VIEW_H}
        stroke="#525252"
        strokeWidth={0.8}
        strokeDasharray="4,3"
        opacity={0.35}
      />

      {peak > 0 &&
        buckets.map((bucket, i) => {
          const x = i * slotWidth + (slotWidth - barWidth) / 2;
          const salesH = barHeight(bucket.sales, peak);
          const purchasesH = barHeight(bucket.purchases, peak);

          return (
            <g key={bucket.monthKey}>
              {bucket.sales > 0 && (
                <rect
                  x={x}
                  y={MIDLINE_Y - salesH}
                  width={barWidth}
                  height={salesH}
                  fill="#dc2626"
                  opacity="0.85"
                />
              )}
              {bucket.purchases > 0 && (
                <rect
                  x={x}
                  y={MIDLINE_Y}
                  width={barWidth}
                  height={purchasesH}
                  fill="#16a34a"
                  opacity="0.85"
                />
              )}
            </g>
          );
        })}
    </svg>
  );
}
