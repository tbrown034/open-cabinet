"use client";

import { useRef, useEffect, useState } from "react";
import { scaleTime, scaleSqrt, scaleBand } from "d3-scale";
import { extent } from "d3-array";
import { timeFormat } from "d3-time-format";
import { amountRangeToMin, amountRangeLabel, formatDate, displayName } from "@/lib/format";

/**
 * SWIM LANE CHART — All Officials, All Trades, One Canvas
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
 * Performance with 2,200+ circles:
 * - React renders all circles as individual SVG elements. SVG handles
 *   this fine — browsers can render thousands of circles efficiently.
 * - We reduce re-renders by only updating tooltip state (one state var).
 * - No transitions or animations — static render is fastest.
 * - For 10,000+ elements, we'd switch to Canvas. At 2,200, SVG is fine.
 */

interface SwimTransaction {
  description: string;
  ticker: string | null;
  type: string;
  date: string;
  amount: string;
  lateFilingFlag: boolean;
  isSale: boolean;
}

interface SwimOfficial {
  name: string;
  slug: string;
  title: string;
  agency: string;
  level: string;
  totalValue: number;
  transactions: SwimTransaction[];
}

type FilterTab = "all" | "cabinet" | "sub-cabinet";

interface TooltipData {
  tx: SwimTransaction;
  officialName: string;
  x: number;
  y: number;
}

export default function SwimLaneChart({
  officials,
}: {
  officials: SwimOfficial[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sortBy, setSortBy] = useState<"volume" | "name" | "recent">("volume");

  const cabinetCount = officials.filter((o) => o.level === "Cabinet").length;
  const subCabinetCount = officials.filter((o) => o.level === "Sub-Cabinet").length;

  const filteredUnsorted = filter === "cabinet"
    ? officials.filter((o) => o.level === "Cabinet")
    : filter === "sub-cabinet"
      ? officials.filter((o) => o.level === "Sub-Cabinet")
      : officials;

  const filtered = [...filteredUnsorted].sort((a, b) => {
    if (sortBy === "name") return displayName(a.name).localeCompare(displayName(b.name));
    if (sortBy === "recent") {
      const aMax = Math.max(...a.transactions.map((t) => new Date(t.date).getTime()));
      const bMax = Math.max(...b.transactions.map((t) => new Date(t.date).getTime()));
      return bMax - aMax;
    }
    return b.totalValue - a.totalValue; // volume (default)
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Responsive: on mobile (<640px), labels go above rows, not left
  const isMobile = width > 0 && width < 640;
  const margin = {
    top: 30,
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
    o.transactions.map((tx) => amountRangeToMin(tx.amount as any))
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
            key={tab.key}
            onClick={() => setFilter(tab.key)}
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

      {/* Sort options */}
      <div className="flex gap-3 mb-4 text-[10px] text-neutral-400">
        <span>Sort:</span>
        {([
          { key: "volume" as const, label: "Volume" },
          { key: "recent" as const, label: "Recent" },
          { key: "name" as const, label: "Name" },
        ]).map((s) => (
          <button
            key={s.key}
            onClick={() => setSortBy(s.key)}
            className={`cursor-pointer ${sortBy === s.key ? "text-neutral-900 font-medium" : "hover:text-neutral-600"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <svg
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
                      {o.title.length > 35 ? o.title.substring(0, 33) + "..." : o.title}
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
                      {o.title.length > 28 ? o.title.substring(0, 26) + "..." : o.title}
                    </text>
                  </a>
                )}
              </g>
            );
          })}

          {/* X-axis */}
          <line
            x1={0}
            y1={chartHeight}
            x2={chartWidth}
            y2={chartHeight}
            stroke="#d4d4d4"
          />
          {ticks.map((tick, i) => {
            const x = xScale(tick);
            return (
              <g key={i} transform={`translate(${x}, ${chartHeight})`}>
                <line y1={0} y2={6} stroke="#a3a3a3" />
                <text
                  y={20}
                  textAnchor="middle"
                  fill="#a3a3a3"
                  className="text-[10px]"
                >
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

          {/* Transaction dots — render all 2,200+ circles */}
          {filtered.flatMap((o) =>
            o.transactions.map((tx, i) => {
              const y = yScale(o.name) ?? 0;
              const bandHeight = yScale.bandwidth();
              const cx = xScale(new Date(tx.date + "T00:00:00"));
              // Mobile: dots below name+title. Desktop: centered
              const cy = isMobile
                ? y + bandHeight * 0.72
                : y + bandHeight / 2;
              const r = rScale(amountRangeToMin(tx.amount as any));

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
                        : 0.2
                      : 0.85
                  }
                  stroke="white"
                  strokeWidth={1}
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

      {/* Tooltip */}
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
            · {amountRangeLabel(tooltip.tx.amount as any)}
            {tooltip.tx.ticker && ` · ${tooltip.tx.ticker}`}
          </div>
          {tooltip.tx.lateFilingFlag && (
            <div className="text-amber-700 font-medium mt-0.5">Late filing</div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 text-xs text-neutral-400">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 opacity-60" />
          Sale
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600 opacity-60" />
          Purchase
        </div>
        <div className="text-neutral-300">|</div>
        <div className="flex items-center gap-2">
          <svg width="44" height="14" className="shrink-0">
            <circle cx="4" cy="7" r="3" fill="#a3a3a3" opacity="0.5" />
            <circle cx="16" cy="7" r="5" fill="#a3a3a3" opacity="0.5" />
            <circle cx="32" cy="7" r="7" fill="#a3a3a3" opacity="0.5" />
          </svg>
          $1K &rarr; $50M+
        </div>
        <div className="text-neutral-300">|</div>
        <div>Sorted by total volume</div>
      </div>
    </div>
  );
}
