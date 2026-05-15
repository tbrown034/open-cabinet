"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { scaleTime, scaleSqrt } from "d3-scale";
import { timeMonth } from "d3-time";
import { timeFormat } from "d3-time-format";
import type { Transaction } from "@/lib/types";

/**
 * MONTHLY BARS — high-density visualization for officials with so many
 * trades that the dot-timeline becomes a smear. One stacked bar per month:
 * sales above the midline (red), purchases below (green). A 1-px amber
 * tick at the top of any month that contains a late-filed trade preserves
 * the accountability signal that the dot view carries via stroke color.
 *
 * Same x-axis (scaleTime) as TransactionTimeline so this can sit directly
 * above the dot view as a "density overview" + drill-down pair.
 */

interface Props {
  transactions: Transaction[];
  // Restrict the chart to a sub-range. Defaults to the full range.
  rangeStart?: Date;
  rangeEnd?: Date;
  // If set, the parent is rendering a filtered subset and this month
  // should be drawn with a highlighted outline.
  selectedMonth?: string | null; // "YYYY-MM"
  // When true, clicking a bar updates ?month=YYYY-MM on the URL so the
  // parent server component can re-filter the dataset.
  clickToZoom?: boolean;
}

function isSale(type: Transaction["type"]): boolean {
  return type === "Sale" || type === "Sale (Partial)" || type === "Sale (Full)";
}

interface MonthBucket {
  month: Date;
  sales: number;
  purchases: number;
  late: number;
  total: number;
}

export default function MonthlyBars({
  transactions,
  rangeStart,
  rangeEnd,
  selectedMonth,
  clickToZoom,
}: Props) {
  const router = useRouter();
  const search = useSearchParams();

  function handleClick(monthKey: string) {
    if (!clickToZoom) return;
    const params = new URLSearchParams(search.toString());
    // Toggle: clicking the same month again clears the filter.
    if (params.get("month") === monthKey) params.delete("month");
    else params.set("month", monthKey);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  const data = useMemo(() => {
    if (transactions.length === 0) return { buckets: [] as MonthBucket[], maxStack: 0 };
    const parsed = transactions
      .map((t) => ({ ...t, dt: new Date(t.date + "T00:00:00") }))
      .filter((t) => !isNaN(t.dt.getTime()));
    const start = rangeStart ?? new Date(Math.min(...parsed.map((t) => t.dt.getTime())));
    const end = rangeEnd ?? new Date(Math.max(...parsed.map((t) => t.dt.getTime())));
    const months = timeMonth.range(timeMonth.floor(start), timeMonth.ceil(end));
    const byMonth = new Map<string, MonthBucket>();
    for (const m of months) {
      const key = m.toISOString().slice(0, 7);
      byMonth.set(key, { month: m, sales: 0, purchases: 0, late: 0, total: 0 });
    }
    for (const t of parsed) {
      if (t.dt < start || t.dt > end) continue;
      const key = t.date.slice(0, 7);
      const b = byMonth.get(key);
      if (!b) continue;
      if (isSale(t.type)) b.sales++;
      else if (t.type === "Purchase") b.purchases++;
      if (t.lateFilingFlag) b.late++;
      b.total++;
    }
    const buckets = Array.from(byMonth.values()).sort((a, b) => a.month.getTime() - b.month.getTime());
    const maxStack = buckets.reduce((m, b) => Math.max(m, b.sales, b.purchases), 0);
    return { buckets, maxStack };
  }, [transactions, rangeStart, rangeEnd]);

  const [hover, setHover] = useState<{ b: MonthBucket; x: number } | null>(null);

  const width = 920;
  const height = 200;
  const margin = { top: 28, right: 16, bottom: 28, left: 16 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const midY = margin.top + innerH / 2;

  if (data.buckets.length === 0) return null;

  const x = scaleTime()
    .domain([data.buckets[0].month, timeMonth.offset(data.buckets[data.buckets.length - 1].month, 1)])
    .range([margin.left, margin.left + innerW]);

  // Half the inner height for each side of the midline. We use scaleSqrt
  // instead of scaleLinear because high-volume officials (Trump) have one
  // or two months that are 10-50x the others — linear scaling makes every
  // smaller month invisible. Sqrt preserves ordinal correctness while
  // compressing the dominance enough to read the rest of the timeline.
  const halfH = (innerH - 6) / 2;
  const y = scaleSqrt()
    .domain([0, Math.max(1, data.maxStack)])
    .range([0, halfH]);

  const monthWidth = innerW / data.buckets.length;
  const barWidth = Math.max(4, monthWidth * 0.75);
  const monthLabel = timeFormat("%b");
  const yearLabel = timeFormat("%Y");

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img">
        {/* Midline */}
        <line
          x1={margin.left}
          x2={margin.left + innerW}
          y1={midY}
          y2={midY}
          stroke="#d4d4d4"
          strokeWidth={0.5}
        />

        {/* Bars */}
        {data.buckets.map((b) => {
          const cx = x(b.month) + monthWidth / 2;
          const xPos = cx - barWidth / 2;
          const salesH = y(b.sales);
          const purchH = y(b.purchases);
          const isHover = hover?.b.month.getTime() === b.month.getTime();
          const monthKey = b.month.toISOString().slice(0, 7);
          const isSelected = selectedMonth === monthKey;
          const clickable = clickToZoom && b.total > 0;
          return (
            <g
              key={b.month.toISOString()}
              onMouseEnter={() => setHover({ b, x: cx })}
              onMouseLeave={() => setHover(null)}
              onClick={() => clickable && handleClick(monthKey)}
              style={{ cursor: clickable ? "pointer" : "default" }}
            >
              {/* Selected highlight — drawn behind the bars */}
              {isSelected && (
                <rect
                  x={xPos - 3}
                  y={margin.top - 2}
                  width={barWidth + 6}
                  height={innerH + 4}
                  fill="none"
                  stroke="#0a0a0a"
                  strokeWidth={1}
                />
              )}
              {/* Invisible hit target so empty months don't grab hover */}
              {b.total > 0 && (
                <rect
                  x={xPos - 2}
                  y={margin.top}
                  width={barWidth + 4}
                  height={innerH}
                  fill="transparent"
                />
              )}
              {/* Sales — above the midline */}
              {b.sales > 0 && (
                <rect
                  x={xPos}
                  y={midY - salesH}
                  width={barWidth}
                  height={salesH}
                  fill="#dc2626"
                  opacity={isHover ? 1 : 0.85}
                />
              )}
              {/* Purchases — below the midline */}
              {b.purchases > 0 && (
                <rect
                  x={xPos}
                  y={midY}
                  width={barWidth}
                  height={purchH}
                  fill="#16a34a"
                  opacity={isHover ? 1 : 0.85}
                />
              )}
              {/* Late-filing tick — amber bar at the very top of the
                  sales stack. We attach it to sales because lateness is
                  the public-interest signal worth foregrounding. */}
              {b.late > 0 && b.sales > 0 && (
                <rect
                  x={xPos}
                  y={midY - salesH - 2}
                  width={barWidth}
                  height={1.5}
                  fill="#f59e0b"
                />
              )}
              {b.late > 0 && b.sales === 0 && b.purchases > 0 && (
                <rect
                  x={xPos}
                  y={midY + purchH + 1}
                  width={barWidth}
                  height={1.5}
                  fill="#f59e0b"
                />
              )}
            </g>
          );
        })}

        {/* Year ticks under the midline */}
        {data.buckets
          .filter((b, i) => i === 0 || b.month.getMonth() === 0)
          .map((b) => (
            <g key={`yr-${b.month.toISOString()}`}>
              <line
                x1={x(b.month)}
                x2={x(b.month)}
                y1={margin.top}
                y2={margin.top + innerH}
                stroke="#e5e5e5"
                strokeDasharray="2 2"
              />
              <text
                x={x(b.month) + 4}
                y={height - 8}
                fontSize={10}
                fill="#737373"
              >
                {yearLabel(b.month)}
              </text>
            </g>
          ))}

        {/* Hover label */}
        {hover && (
          <text
            x={hover.x}
            y={margin.top - 8}
            textAnchor="middle"
            fontSize={10}
            fill="#404040"
          >
            {monthLabel(hover.b.month)} {yearLabel(hover.b.month)} · {hover.b.total} trade
            {hover.b.total === 1 ? "" : "s"}
            {hover.b.late > 0 ? ` · ${hover.b.late} late` : ""}
          </text>
        )}
      </svg>

      {/* Below-chart legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500 mt-1 pl-4">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 bg-red-600" /> Sales
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 bg-emerald-600" /> Purchases
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-[2px] bg-amber-500" /> Months
          with late-filed trades
        </span>
        <span className="text-neutral-400">Bar height = trades that month</span>
      </div>
    </div>
  );
}
