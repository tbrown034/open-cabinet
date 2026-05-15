"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { scaleTime, scaleSqrt, scaleBand } from "d3-scale";
import { timeFormat } from "d3-time-format";
import Link from "next/link";
import { displayName } from "@/lib/format";

interface PreviewTx {
  description: string;
  ticker: string | null;
  type: string;
  date: string;
  amount: string;
  isSale: boolean;
  // Optional late-filing flag — may or may not be present on existing data.
  // We read it defensively below so this component doesn't require a schema change.
  lateFiled?: boolean;
}

export interface PreviewOfficial {
  name: string;
  slug: string;
  title: string;
  transactions: PreviewTx[];
}

interface MonthBucket {
  monthKey: string; // YYYY-MM
  monthStart: Date;
  sales: number;
  purchases: number;
  late: number;
}

interface TooltipData {
  officialName: string;
  monthLabel: string;
  sales: number;
  purchases: number;
  late: number;
  x: number;
  y: number;
}

const TOP_COUNT = 5;
const LANE_HEIGHT = 58;
const BAR_MIN_H = 4;
const BAR_MAX_H = 28;

// Heuristic late-filing detector. The transaction object in this preview
// component doesn't carry the full schema, so we look for an explicit
// `lateFiled` field if present. Falls back to false.
function isLateFiled(tx: PreviewTx): boolean {
  return Boolean(tx.lateFiled);
}

function monthKeyOf(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

export default function HomeSwimPreview({
  officials,
  totalOfficials,
}: {
  officials: PreviewOfficial[];
  totalOfficials: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const top = officials.slice(0, TOP_COUNT);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const isMobile = width > 0 && width < 640;
  const margin = {
    top: 22,
    right: 10,
    bottom: 26,
    left: isMobile ? 10 : 180,
  };
  const chartWidth = Math.max(width - margin.left - margin.right, 200);
  const chartHeight = top.length * (isMobile ? 64 : LANE_HEIGHT);
  const height = chartHeight + margin.top + margin.bottom;

  const yScale = scaleBand()
    .domain(top.map((o) => o.name))
    .range([0, chartHeight])
    .padding(0.25);

  // Aggregate trades into monthly buckets per official.
  // D3 for math: compute counts in JS, render rects in JSX.
  const { perOfficial, monthsAxis, maxMonthlyCount, dateExtent } = useMemo(() => {
    const allDates: Date[] = [];
    const buckets = new Map<string, Map<string, MonthBucket>>();

    for (const o of top) {
      const m = new Map<string, MonthBucket>();
      for (const tx of o.transactions) {
        const d = new Date(tx.date + "T00:00:00Z");
        if (isNaN(d.getTime())) continue;
        allDates.push(d);
        const ms = startOfMonth(d);
        const key = monthKeyOf(d);
        const existing = m.get(key) ?? {
          monthKey: key,
          monthStart: ms,
          sales: 0,
          purchases: 0,
          late: 0,
        };
        if (tx.isSale) existing.sales += 1;
        else existing.purchases += 1;
        if (isLateFiled(tx)) existing.late += 1;
        m.set(key, existing);
      }
      buckets.set(o.slug, m);
    }

    if (allDates.length === 0) {
      return {
        perOfficial: buckets,
        monthsAxis: [] as Date[],
        maxMonthlyCount: 1,
        dateExtent: [new Date("2025-01-01"), new Date("2026-04-01")] as [Date, Date],
      };
    }

    const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())));
    const today = new Date();
    const startMonth = startOfMonth(minDate);
    const endMonth = startOfMonth(today);

    const axis: Date[] = [];
    let cur = startMonth;
    while (cur.getTime() <= endMonth.getTime()) {
      axis.push(cur);
      cur = addMonths(cur, 1);
    }

    let maxCount = 1;
    for (const m of buckets.values()) {
      for (const b of m.values()) {
        const total = b.sales + b.purchases;
        if (total > maxCount) maxCount = total;
      }
    }

    return {
      perOfficial: buckets,
      monthsAxis: axis,
      maxMonthlyCount: maxCount,
      dateExtent: [startMonth, endMonth] as [Date, Date],
    };
  }, [top]);

  const dayPad = 14 * 24 * 60 * 60 * 1000;
  const xScale = scaleTime()
    .domain([
      new Date(dateExtent[0].getTime() - dayPad),
      new Date(dateExtent[1].getTime() + dayPad),
    ])
    .range([0, chartWidth]);

  // Shared sqrt height scale across all lanes so monthly densities are
  // visually comparable between officials. Square-root keeps the busy
  // months from dwarfing the quiet ones.
  const hScale = scaleSqrt()
    .domain([0, Math.max(maxMonthlyCount, 1)])
    .range([0, BAR_MAX_H]);

  const monthCount = Math.max(monthsAxis.length, 1);
  const bandWidth = chartWidth / monthCount;
  const barWidth = Math.max(bandWidth * 0.7, 1);

  const ticks = xScale.ticks(Math.max(Math.floor(chartWidth / 140), 3));
  const formatTick = timeFormat("%b %Y");
  const formatMonth = timeFormat("%B %Y");

  if (width <= 0) return <div ref={containerRef} style={{ height }} />;

  return (
    <div ref={containerRef} className="relative">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Preview swim lane showing top ${TOP_COUNT} officials by trading volume`}
      >
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {top.map((o, i) => {
            const y = yScale(o.name) ?? 0;
            const bandHeight = yScale.bandwidth();
            return (
              <g key={`lane-${o.slug}`}>
                {i % 2 === 0 && (
                  <rect
                    x={0}
                    y={y}
                    width={chartWidth}
                    height={bandHeight}
                    fill="#fafaf9"
                  />
                )}
                {isMobile ? (
                  <a href={`/officials/${o.slug}`}>
                    <text
                      x={4}
                      y={y + 12}
                      textAnchor="start"
                      fill="#292524"
                      className="text-[10px]"
                      fontWeight="500"
                    >
                      {displayName(o.name)}
                    </text>
                  </a>
                ) : (
                  <a href={`/officials/${o.slug}`}>
                    <text
                      x={-8}
                      y={y + bandHeight / 2}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fill="#292524"
                      className="text-[12px]"
                      fontWeight="500"
                    >
                      {displayName(o.name)}
                    </text>
                  </a>
                )}
              </g>
            );
          })}

          <line
            x1={0}
            y1={chartHeight}
            x2={chartWidth}
            y2={chartHeight}
            stroke="#d4d4d4"
          />
          {ticks.map((tick, i) => (
            <g
              key={`t-${i}`}
              transform={`translate(${xScale(tick)}, ${chartHeight})`}
            >
              <line y1={0} y2={4} stroke="#a3a3a3" />
              <text
                y={16}
                textAnchor="middle"
                fill="#a3a3a3"
                className="text-[10px]"
              >
                {formatTick(tick)}
              </text>
            </g>
          ))}

          {ticks.map((tick, i) => (
            <line
              key={`g-${i}`}
              x1={xScale(tick)}
              y1={0}
              x2={xScale(tick)}
              y2={chartHeight}
              stroke="#e5e5e5"
              strokeWidth={0.5}
              strokeDasharray="2,4"
            />
          ))}

          {(() => {
            const x = xScale(new Date("2025-01-20T00:00:00"));
            if (x < 0 || x > chartWidth) return null;
            return (
              <line
                x1={x}
                y1={0}
                x2={x}
                y2={chartHeight}
                stroke="#525252"
                strokeWidth={1}
                strokeDasharray="4,3"
                opacity={0.5}
              />
            );
          })()}

          {/* Monthly stacked spark-bars.
              Sales sit above the lane midline (red), purchases below (green).
              This gives each lane a net-direction read at a glance:
              top-heavy = mostly selling, bottom-heavy = mostly buying. */}
          {top.flatMap((o) => {
            const y = yScale(o.name) ?? 0;
            const bandHeight = yScale.bandwidth();
            const midline = y + bandHeight / 2;
            const months = perOfficial.get(o.slug);
            if (!months) return [];
            const isHovered = (mk: string) =>
              tooltip?.officialName === o.name && tooltip?.monthLabel === mk;

            return monthsAxis.map((monthStart) => {
              const key = monthKeyOf(monthStart);
              const bucket = months.get(key);
              if (!bucket) return null;
              const total = bucket.sales + bucket.purchases;
              if (total === 0) return null;

              const cx = xScale(monthStart);
              const x = cx - barWidth / 2;

              // Each side gets at least BAR_MIN_H if it has any trades,
              // so a single-trade month is still visible.
              const salesH =
                bucket.sales > 0
                  ? Math.max(hScale(bucket.sales), BAR_MIN_H)
                  : 0;
              const purchasesH =
                bucket.purchases > 0
                  ? Math.max(hScale(bucket.purchases), BAR_MIN_H)
                  : 0;

              const monthLabel = formatMonth(monthStart);
              const hovered = isHovered(monthLabel);
              const opacity = tooltip ? (hovered ? 1 : 0.35) : 0.85;

              const onEnter = () =>
                setTooltip({
                  officialName: o.name,
                  monthLabel,
                  sales: bucket.sales,
                  purchases: bucket.purchases,
                  late: bucket.late,
                  x: cx + margin.left,
                  y: midline + margin.top,
                });
              const onLeave = () => setTooltip(null);

              return (
                <g key={`${o.slug}-${key}`}>
                  {/* Wider invisible hover target covering the full band. */}
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={bandHeight}
                    fill="transparent"
                    onMouseEnter={onEnter}
                    onMouseLeave={onLeave}
                    style={{ cursor: "pointer" }}
                  />
                  {bucket.sales > 0 && (
                    <rect
                      x={x}
                      y={midline - salesH}
                      width={barWidth}
                      height={salesH}
                      fill="#dc2626"
                      opacity={opacity}
                      pointerEvents="none"
                    />
                  )}
                  {bucket.purchases > 0 && (
                    <rect
                      x={x}
                      y={midline}
                      width={barWidth}
                      height={purchasesH}
                      fill="#16a34a"
                      opacity={opacity}
                      pointerEvents="none"
                    />
                  )}
                  {bucket.late > 0 && (
                    <rect
                      x={x}
                      y={midline - salesH - 2}
                      width={barWidth}
                      height={1}
                      fill="#f59e0b"
                      pointerEvents="none"
                    />
                  )}
                </g>
              );
            });
          })}
        </g>
      </svg>

      {tooltip && (
        <div
          className="absolute pointer-events-none bg-white border border-neutral-200 shadow-sm px-3 py-2 text-xs max-w-64 z-10"
          style={{
            left: Math.min(tooltip.x, width - 250),
            top: Math.max(tooltip.y - 70, 0),
          }}
        >
          <div className="font-medium text-neutral-900 mb-1">
            {displayName(tooltip.officialName)}
          </div>
          <div className="text-neutral-600">{tooltip.monthLabel}</div>
          <div className="text-neutral-500 mt-1">
            <span className="text-red-700">{tooltip.sales} sales</span>
            {" · "}
            <span className="text-emerald-700">
              {tooltip.purchases} purchases
            </span>
            {tooltip.late > 0 && (
              <>
                {" · "}
                <span className="text-amber-600">
                  {tooltip.late} late-filed
                </span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-neutral-200 pt-3 gap-4 flex-wrap">
        <p className="text-xs text-neutral-500">
          Showing the {TOP_COUNT} highest-volume officials. Bars are monthly
          trade counts — the per-trade dot view (one circle per disclosure)
          is on the full chart.{" "}
          <span className="text-neutral-700 font-medium">
            {totalOfficials - TOP_COUNT} more
          </span>{" "}
          officials there too.
        </p>
        <Link
          href="/all"
          className="text-xs font-medium text-neutral-900 underline underline-offset-4 decoration-2 hover:decoration-red-600"
        >
          See every trade &rarr;
        </Link>
      </div>
    </div>
  );
}
