"use client";

import { useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { scaleTime, scaleSqrt, scaleBand } from "d3-scale";
import { extent } from "d3-array";
import { timeFormat } from "d3-time-format";
import Link from "next/link";
import Image from "next/image";
import { amountRangeToMin, amountRangeLabel, formatDate, displayName } from "@/lib/format";
import type { AmountRange } from "@/lib/types";
import { useContainerWidth } from "./use-container-width";

/**
 * SWIM LANE CHART, All Officials, All Trades, One Canvas
 *
 * D3 concepts:
 *
 * - scaleBand (Y-axis): Maps each official's name to a horizontal "lane."
 *   Unlike scaleLinear (continuous numbers), scaleBand maps discrete
 *   categories to evenly-spaced bands. Each band has a position and a
 *   bandwidth (height). The .padding() method adds space between lanes.
 *
 * - scaleTime (X-axis): Maps dates to horizontal pixel positions, same
 *   as in the individual timelines.
 *
 * - scaleSqrt (radius): Maps transaction amounts to dot sizes. Using
 *   sqrt ensures perceived area scales linearly with value.
 *
 * Performance with 3,200+ circles:
 * - React renders all circles as individual SVG elements. SVG handles
 *   this fine, browsers can render thousands of circles efficiently.
 * - We reduce re-renders by only updating tooltip state (one state var).
 * - No transitions or animations, static render is fastest.
 * - For 10,000+ elements, we'd switch to Canvas. At 3,200+, SVG is fine.
 */

interface SwimTransaction {
  description: string;
  ticker: string | null;
  type: string;
  date: string;
  amount: AmountRange;
  lateFilingFlag: boolean;
  isSale: boolean;
}

interface SwimOfficial {
  name: string;
  slug: string;
  title: string;
  agency: string;
  level: string;
  departedDate?: string | null;
  totalValue: number;
  transactions: SwimTransaction[];
}

type FilterTab = "all" | "cabinet" | "sub-cabinet";
type SortKey = "volume" | "name" | "recent";
type TimeRange = "inaug" | "2025" | "2026" | "all";

const FILTER_TABS: readonly FilterTab[] = ["all", "cabinet", "sub-cabinet"];
const SORT_KEYS: readonly SortKey[] = ["volume", "name", "recent"];
const TIME_RANGES: readonly TimeRange[] = ["inaug", "2025", "2026", "all"];

interface TooltipData {
  tx: SwimTransaction;
  officialName: string;
  x: number;
  y: number;
}

// Read a query param against an allow-list, falling back to a default so a
// hand-edited or stale URL can't push the chart into an invalid state.
function parseParam<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T
): T {
  return value && allowed.includes(value as T) ? (value as T) : fallback;
}

export default function SwimLaneChart({
  officials,
}: {
  officials: SwimOfficial[];
}) {
  const [containerRef, width] = useContainerWidth<HTMLDivElement>(1000);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // The chart's view state (group / sort / period) lives in the URL, so any
  // filtered view is shareable and bookmarkable. Default values are omitted
  // from the query string, so the pristine chart stays at a clean /all.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filter = parseParam(searchParams.get("group"), FILTER_TABS, "all");
  const sortBy = parseParam(searchParams.get("sort"), SORT_KEYS, "volume");
  const timeRange = parseParam(searchParams.get("period"), TIME_RANGES, "inaug");

  function setParam(key: string, value: string, isDefault: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (isDefault) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    // replace(), not push(), so filtering doesn't pile up back-button history.
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Time range cutoffs
  const timeRangeStart = timeRange === "inaug" ? "2025-01-20"
    : timeRange === "2025" ? "2025-01-01"
    : timeRange === "2026" ? "2026-01-01"
    : "1900-01-01";
  const timeRangeEnd = timeRange === "2025" ? "2025-12-31"
    : timeRange === "2026" ? "2026-12-31"
    : "2099-12-31";

  const cabinetCount = officials.filter((o) => o.level === "Cabinet").length;
  const subCabinetCount = officials.filter((o) => o.level === "Sub-Cabinet").length;

  const filteredUnsorted = [];
  for (const official of officials) {
    if (filter === "cabinet" && official.level !== "Cabinet") continue;
    if (filter === "sub-cabinet" && official.level !== "Sub-Cabinet") continue;
    const transactions = official.transactions.filter(
      (t) => t.date >= timeRangeStart && t.date <= timeRangeEnd
    );
    if (transactions.length === 0) continue;
    filteredUnsorted.push({ ...official, transactions });
  }

  const filtered = filteredUnsorted.toSorted((a, b) => {
    if (sortBy === "name") return displayName(a.name).localeCompare(displayName(b.name));
    if (sortBy === "recent") {
      const aMax = Math.max(...a.transactions.map((t) => new Date(t.date).getTime()));
      const bMax = Math.max(...b.transactions.map((t) => new Date(t.date).getTime()));
      return bMax - aMax;
    }
    return b.totalValue - a.totalValue; // volume (default)
  });

  // Responsive: on mobile (<640px), labels go above rows, not left
  const isMobile = width > 0 && width < 640;
  const margin = {
    top: 40,
    right: 10,
    bottom: 40,
    left: isMobile ? 10 : 220,
  };
  // Mobile: taller lanes to fit name + title above dots
  const laneHeight = isMobile
    ? 65
    : filter === "cabinet" ? 56 : 44;
  const height =
    filtered.length * laneHeight + margin.top + margin.bottom;
  const chartWidth = Math.max(width - margin.left - margin.right, 200);
  const chartHeight = filtered.length * laneHeight;

  // scaleBand: one lane per official, spaced evenly
  const yScale = scaleBand()
    .domain(filtered.map((o) => o.name))
    .range([0, chartHeight])
    .padding(0.15);

  // Collect all transaction dates for the x-axis domain
  const allDates = filtered.flatMap((o) =>
    o.transactions.map((tx) => new Date(tx.date + "T00:00:00"))
  );
  const dateExtent = extent(allDates) as [Date, Date];
  const dayPad = 14 * 24 * 60 * 60 * 1000;
  const xScale = scaleTime()
    .domain([
      new Date(dateExtent[0].getTime() - dayPad),
      new Date(dateExtent[1].getTime() + dayPad),
    ])
    .range([0, chartWidth]);

  // Collect all amounts for radius scale
  const allAmounts = filtered.flatMap((o) =>
    o.transactions.map((tx) => amountRangeToMin(tx.amount))
  );
  const amountExtent = extent(allAmounts) as [number, number];
  const maxR = isMobile ? 10 : filter === "cabinet" ? 12 : 10;
  const minR = isMobile ? 3 : 2;
  const rScale = scaleSqrt()
    .domain([amountExtent[0], Math.max(amountExtent[1], amountExtent[0] + 1)])
    .range([minR, maxR]);

  const ticks = xScale.ticks(Math.max(Math.floor(chartWidth / 140), 3));
  const formatTick = timeFormat("%b %Y");

  if (width <= 0) {
    return <div ref={containerRef} style={{ height }} />;
  }

  const svgWidth = width;

  return (
    <div ref={containerRef} className="relative">
      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 text-xs">
        {([
          { key: "all" as FilterTab, label: `All (${officials.length})` },
          { key: "cabinet" as FilterTab, label: `Cabinet (${cabinetCount})` },
          { key: "sub-cabinet" as FilterTab, label: `Sub-Cabinet (${subCabinetCount})` },
        ]).map((tab) => (
          <button
            type="button"
            key={tab.key}
            onClick={() => setParam("group", tab.key, tab.key === "all")}
            className={`px-3 py-1.5 transition-colors cursor-pointer ${
              filter === tab.key
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Time range + sort */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4 text-[10px] text-neutral-400">
        <div className="flex gap-3 items-center">
          <span>Period:</span>
          {([
            { key: "inaug" as const, label: "Since inauguration" },
            { key: "2025" as const, label: "2025" },
            { key: "2026" as const, label: "2026" },
            { key: "all" as const, label: "All time" },
          ]).map((t) => (
            <button
              type="button"
              key={t.key}
              onClick={() => setParam("period", t.key, t.key === "inaug")}
              className={`cursor-pointer ${timeRange === t.key ? "text-neutral-900 font-medium" : "hover:text-neutral-600"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-3 items-center">
          <span>Sort:</span>
          {([
            { key: "volume" as const, label: "Volume" },
            { key: "recent" as const, label: "Recent" },
            { key: "name" as const, label: "Name" },
          ]).map((s) => (
            <button
              type="button"
              key={s.key}
              onClick={() => setParam("sort", s.key, s.key === "volume")}
              className={`cursor-pointer ${sortBy === s.key ? "text-neutral-900 font-medium" : "hover:text-neutral-600"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* MOBILE: HTML cards with inline SVG dot strips */}
      {isMobile && (
        <div className="space-y-1">
          {filtered.map((o) => {
            const dotHeight = 30;
            const roleLabel = o.departedDate
              ? `Former official · ${o.title}`
              : o.title;
            return (
              <div key={o.slug} className="border-b border-neutral-100 pb-1">
                <Link href={`/officials/${o.slug}`} className="flex items-center gap-2 py-1">
                  <Image
                    src={`/photos/${o.slug}.jpg`}
                    alt=""
                    width={32}
                    height={32}
                    className="size-8 rounded-full object-cover shrink-0 bg-neutral-200"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-neutral-900 truncate">
                      {displayName(o.name)}
                    </div>
                    <div className="text-[10px] text-neutral-400 truncate">
                      {roleLabel}
                    </div>
                  </div>
                </Link>
                <svg width={chartWidth} height={dotHeight} className="overflow-visible">
                  {o.transactions.map((tx, i) => {
                    const cx = xScale(new Date(tx.date + "T00:00:00"));
                    const r = rScale(amountRangeToMin(tx.amount));
                    return (
                      <circle
                        key={i}
                        cx={cx}
                        cy={dotHeight / 2}
                        r={r}
                        fill={tx.isSale ? "#dc2626" : "#16a34a"}
                        opacity={0.85}
                        stroke="none"
                      />
                    );
                  })}
                </svg>
              </div>
            );
          })}
          <div className="flex gap-3 mt-2 text-[10px] text-neutral-400">
            <div className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-red-600 opacity-60" />
              Sale
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-emerald-600 opacity-60" />
              Purchase
            </div>
          </div>
        </div>
      )}

      {/* Legend, above chart so readers see it first */}
      {!isMobile && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 mb-3 text-xs text-neutral-400">
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-red-600 opacity-60" />
            Sale
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-emerald-600 opacity-60" />
            Purchase
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-0 h-3 border-l border-dashed border-neutral-500" />
            Inauguration
          </div>
          <div className="text-neutral-300">|</div>
          <div>Circle size = transaction amount</div>
        </div>
      )}

      {/* DESKTOP: Full SVG swim lane chart */}
      {!isMobile && <><svg
        width={svgWidth}
        height={height}
        role="img"
        aria-label={`Swim lane chart showing ${filtered.reduce((s, o) => s + o.transactions.length, 0)} transactions across ${filtered.length} officials`}
      >
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* Lane backgrounds and labels */}
          {filtered.map((o, i) => {
            const y = yScale(o.name) ?? 0;
            const bandHeight = yScale.bandwidth();
            const roleLabel = o.departedDate
              ? `Former official · ${o.title}`
              : o.title;
            return (
              <g key={o.slug}>
                {/* Alternating lane backgrounds for readability */}
                {i % 2 === 0 && (
                  <rect
                    x={0}
                    y={y}
                    width={chartWidth}
                    height={bandHeight}
                    fill="#fafaf9"
                  />
                )}
                {/* Lane divider */}
                <line
                  x1={0}
                  y1={y + bandHeight}
                  x2={chartWidth}
                  y2={y + bandHeight}
                  stroke="#e5e5e5"
                  strokeWidth={0.5}
                />
                {/* Official name + title label */}
                {isMobile ? (
                  // Mobile: name + title inside the lane, top-left
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
                    <text
                      x={4}
                      y={y + 23}
                      textAnchor="start"
                      fill="#a3a3a3"
                      className="text-[8px]"
                    >
                      {roleLabel.length > 35
                        ? roleLabel.substring(0, 33) + "..."
                        : roleLabel}
                    </text>
                  </a>
                ) : (
                  // Desktop: label to the left of the lane
                  <a href={`/officials/${o.slug}`}>
                    <text
                      x={-8}
                      y={y + bandHeight / 2 - 6}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fill="#292524"
                      className="text-[11px]"
                      fontWeight="500"
                    >
                      {displayName(o.name)}
                    </text>
                    <text
                      x={-8}
                      y={y + bandHeight / 2 + 7}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fill="#a3a3a3"
                      className="text-[9px]"
                    >
                      {roleLabel.length > 28
                        ? roleLabel.substring(0, 26) + "..."
                        : roleLabel}
                    </text>
                  </a>
                )}
              </g>
            );
          })}

          {/* X-axis top */}
          <line x1={0} y1={0} x2={chartWidth} y2={0} stroke="#d4d4d4" />
          {ticks.map((tick, i) => {
            const x = xScale(tick);
            return (
              <g key={`top-${i}`} transform={`translate(${x}, 0)`}>
                <line y1={0} y2={-4} stroke="#a3a3a3" />
                <text y={-8} textAnchor="middle" fill="#a3a3a3" className="text-[10px]">
                  {formatTick(tick)}
                </text>
              </g>
            );
          })}

          {/* X-axis bottom */}
          <line x1={0} y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="#d4d4d4" />
          {ticks.map((tick, i) => {
            const x = xScale(tick);
            return (
              <g key={`bot-${i}`} transform={`translate(${x}, ${chartHeight})`}>
                <line y1={0} y2={6} stroke="#a3a3a3" />
                <text y={20} textAnchor="middle" fill="#a3a3a3" className="text-[10px]">
                  {formatTick(tick)}
                </text>
              </g>
            );
          })}

          {/* Vertical grid lines */}
          {ticks.map((tick, i) => (
            <line
              key={`grid-${i}`}
              x1={xScale(tick)}
              y1={0}
              x2={xScale(tick)}
              y2={chartHeight}
              stroke="#e5e5e5"
              strokeWidth={0.5}
              strokeDasharray="2,4"
            />
          ))}

          {/* Key date markers */}
          {(() => {
            const markers = [
              { date: "2025-01-20", label: "Inauguration", color: "#525252" },
            ];
            return markers.map((m) => {
              const x = xScale(new Date(m.date + "T00:00:00"));
              if (x < 0 || x > chartWidth) return null;
              return (
                <g key={m.date}>
                  <line
                    x1={x}
                    y1={-8}
                    x2={x}
                    y2={chartHeight}
                    stroke={m.color}
                    strokeWidth={1}
                    strokeDasharray="4,3"
                    opacity={0.6}
                  />
                  <text
                    x={x}
                    y={-12}
                    textAnchor="middle"
                    fill={m.color}
                    className="text-[9px]"
                    fontWeight="500"
                  >
                    {m.label}
                  </text>
                </g>
              );
            });
          })()}

          {/* Transaction dots, render all 3,200+ circles */}
          {filtered.flatMap((o) =>
            o.transactions.map((tx, i) => {
              const y = yScale(o.name) ?? 0;
              const bandHeight = yScale.bandwidth();
              const cx = xScale(new Date(tx.date + "T00:00:00"));
              // Mobile: dots below name+title. Desktop: centered
              const cy = isMobile
                ? y + bandHeight * 0.72
                : y + bandHeight / 2;
              const r = rScale(amountRangeToMin(tx.amount));

              return (
                <circle
                  key={`${o.slug}-${tx.date}-${i}`}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={tx.isSale ? "#dc2626" : "#16a34a"}
                  opacity={
                    tooltip
                      ? tooltip.tx === tx && tooltip.officialName === o.name
                        ? 1
                        : 0.15
                      : 0.85
                  }
                  stroke="none"
                  onMouseEnter={() =>
                    setTooltip({
                      tx,
                      officialName: o.name,
                      x: cx + margin.left,
                      y: cy + margin.top,
                    })
                  }
                  onMouseLeave={() => setTooltip(null)}
                  style={{ cursor: "pointer" }}
                />
              );
            })
          )}
        </g>
      </svg>

      {/* Desktop Tooltip */}
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
          <div className="text-neutral-600">{tooltip.tx.description}</div>
          <div className="text-neutral-500 mt-1">
            {formatDate(tooltip.tx.date)} ·{" "}
            <span
              className={
                tooltip.tx.isSale ? "text-red-700" : "text-emerald-700"
              }
            >
              {tooltip.tx.type}
            </span>{" "}
            · {amountRangeLabel(tooltip.tx.amount)}
            {tooltip.tx.ticker && ` · ${tooltip.tx.ticker}`}
          </div>
          {tooltip.tx.lateFilingFlag && (
            <div className="text-amber-700 font-medium mt-0.5">Late filing</div>
          )}
        </div>
      )}

      <div className="text-[10px] text-neutral-400 mt-2">
        Hover over any dot for details. Click an official{"'"}s name to view their full profile.
      </div>
      </>}
    </div>
  );
}
