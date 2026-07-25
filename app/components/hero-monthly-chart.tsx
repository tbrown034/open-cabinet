import Link from "next/link";
import {
  formatMonthLong,
  formatMonthShort,
  type MonthBucket,
} from "@/lib/monthly-activity";

/**
 * The hero mark: disclosed trades per month across the whole roster.
 *
 * It replaced a decorative SVG whose every coordinate was invented. On a site
 * whose premise is "here are the real filings," the first graphic above the
 * fold has to be real, and it previews the monthly chart the reader actually
 * reaches further down the page rather than a view behind a nav click.
 */

const VIEW_W = 288;
const VIEW_H = 150;
// Sitting the midline above centre gives the purchase side the longer run.
const MIDLINE_Y = VIEW_H * 0.47;
const PAD = 3;

export default function HeroMonthlyChart({
  buckets,
}: {
  buckets: MonthBucket[];
}) {
  const monthCount = Math.max(buckets.length, 1);
  const slotWidth = VIEW_W / monthCount;
  const barWidth = slotWidth * 0.74;

  let peakSales = 0;
  let peakPurchases = 0;
  for (const b of buckets) {
    if (b.sales > peakSales) peakSales = b.sales;
    if (b.purchases > peakPurchases) peakPurchases = b.purchases;
  }

  /**
   * Square-root scaling, matching the monthly chart this thumbnail previews.
   * Linear scaling would make the 2026 escalation look sharper here than in
   * the real chart, and a teaser that overstates its own chart is the one
   * inaccuracy this site cannot afford.
   *
   * One shared unit drives both directions, sized to whichever side runs out
   * of room first, so a month with equal sales and purchases draws
   * symmetrically instead of the two sides using different scales.
   */
  const upRoom = MIDLINE_Y - PAD;
  const downRoom = VIEW_H - MIDLINE_Y - PAD;
  const unit = Math.min(
    peakSales > 0 ? upRoom / Math.sqrt(peakSales) : Infinity,
    peakPurchases > 0 ? downRoom / Math.sqrt(peakPurchases) : Infinity
  );
  const scale = Number.isFinite(unit) ? unit : 0;

  const firstMonth = buckets[0]?.monthKey;
  const lastMonth = buckets[buckets.length - 1]?.monthKey;
  const rangeLabel =
    firstMonth && lastMonth
      ? `${formatMonthShort(firstMonth)} – ${formatMonthShort(lastMonth)}`
      : "";
  const ariaLabel =
    firstMonth && lastMonth
      ? `Monthly disclosed trades, sales above the line and purchases below, ${formatMonthLong(firstMonth)} to ${formatMonthLong(lastMonth)}.`
      : "Monthly disclosed trades.";

  return (
    <Link
      href="/all"
      className="block shrink-0 w-full md:w-auto group"
      aria-label="See every trade"
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        className="block w-full h-[110px] md:w-[288px] md:h-[150px]"
      >
        <line
          x1={0}
          y1={MIDLINE_Y}
          x2={VIEW_W}
          y2={MIDLINE_Y}
          stroke="#d4d4d4"
          strokeWidth={0.6}
        />
        {buckets.map((bucket, i) => {
          const x = i * slotWidth;
          const salesH = Math.sqrt(bucket.sales) * scale;
          const purchasesH = Math.sqrt(bucket.purchases) * scale;
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
      <p className="text-[11px] leading-[1.45] text-neutral-400 mt-2 group-hover:text-neutral-500 transition-colors">
        Sales above &middot; purchases below
        <br />
        {rangeLabel}
      </p>
    </Link>
  );
}
