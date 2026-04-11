"use client";

import { useRef, useEffect, useState } from "react";
import { scaleTime, scaleLinear, scaleSqrt } from "d3-scale";
import { timeFormat } from "d3-time-format";
import { extent } from "d3-array";
import type { Transaction } from "@/lib/types";
import { amountRangeToMin, amountRangeLabel, formatDate } from "@/lib/format";

/**
 * TRANSACTION TIMELINE — D3 + React Integration
 *
 * This component demonstrates the "D3 for math, React for DOM" pattern:
 *
 * - D3 handles the MATH: computing scales that map data values to pixel
 *   coordinates, formatting dates and numbers, calculating layout positions.
 *
 * - React handles the DOM: rendering SVG elements, managing state (tooltips,
 *   hover), and handling user interactions.
 *
 * Why this pattern? React owns the DOM via its virtual DOM diffing. If D3 also
 * tries to manipulate the DOM (via d3.select().append()), they fight over who
 * controls what. By limiting D3 to pure computation, we get the best of both:
 * D3's powerful data transformation + React's efficient rendering.
 */

interface TimelineProps {
  transactions: Transaction[];
}

interface TooltipData {
  tx: Transaction;
  x: number;
  y: number;
}

function isSale(type: Transaction["type"]): boolean {
  return type === "Sale" || type === "Sale (Partial)" || type === "Sale (Full)";
}

export default function TransactionTimeline({ transactions }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // Responsive width: observe the container and update width on resize
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

  // ── LAYOUT CONSTANTS ──
  // These define the "margin convention" — the space between the SVG edge
  // and the chart area where data is plotted. This leaves room for axes,
  // labels, and padding.
  const margin = { top: 20, right: 20, bottom: 40, left: 20 };
  // Scale height with number of trades so dense single-day clusters
  // (like Mody's 20 trades) have room to spread vertically
  const maxSameDay = Math.max(
    ...Array.from(
      transactions.reduce((map, tx) => {
        map.set(tx.date, (map.get(tx.date) || 0) + 1);
        return map;
      }, new Map<string, number>()).values()
    )
  );
  const height = Math.max(200, Math.min(400, maxSameDay * 18 + 60));
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // ── SCALES ──
  // Scales are the core of D3. A scale is a function that maps from a
  // "domain" (your data values) to a "range" (pixel positions on screen).
  //
  // Think of it like unit conversion:
  //   domain: [Jan 2025, Dec 2025]  →  range: [0px, 800px]
  //   So a date of July 2025 maps to roughly 400px.

  // Parse dates and amounts for scale computation
  const parsedData = transactions.map((tx) => ({
    tx,
    date: new Date(tx.date + "T00:00:00"),
    amount: amountRangeToMin(tx.amount),
  }));

  // scaleTime: Maps Date objects to pixel positions.
  // We use scaleTime (not scaleLinear) because it understands calendar
  // math — months have different lengths, leap years exist, etc.
  // .nice() rounds the domain to clean calendar boundaries (e.g., start
  // of month instead of Jan 17).
  const dateExtent = extent(parsedData, (d) => d.date) as [Date, Date];

  // Add padding to the date range so dots aren't flush against edges
  const dayPadding = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
  const xScale = scaleTime()
    .domain([
      new Date(dateExtent[0].getTime() - dayPadding),
      new Date(dateExtent[1].getTime() + dayPadding),
    ])
    .range([0, chartWidth]);

  // scaleSqrt: Maps dollar amounts to circle radii.
  // Why sqrt instead of linear? Human perception of area is nonlinear.
  // If we doubled the radius, the circle AREA would quadruple (area = πr²),
  // making large values look disproportionately huge. scaleSqrt compensates:
  // it maps values to radii such that the AREA scales linearly with data.
  const amountExtent = extent(parsedData, (d) => d.amount) as [number, number];
  const rScale = scaleSqrt()
    .domain([amountExtent[0], Math.max(amountExtent[1], amountExtent[0] + 1)])
    .range([5, 20]);

  // ── JITTERING ──
  // When many trades share the same date (like Mody's 20 trades on
  // Jan 30), dots pile up at one x-coordinate. We spread them vertically
  // using a deterministic offset based on each trade's position within
  // its date group. This is called "jittering" in data viz — adding small
  // random or systematic offsets to prevent overplotting.
  const dateGroups = new Map<string, number>();
  const dateCounts = new Map<string, number>();
  parsedData.forEach((d) => {
    const key = d.tx.date;
    dateCounts.set(key, (dateCounts.get(key) || 0) + 1);
  });
  parsedData.forEach((d) => {
    const key = d.tx.date;
    const idx = dateGroups.get(key) || 0;
    dateGroups.set(key, idx + 1);
  });

  // Reset for the actual render pass
  const dateGroupIndex = new Map<string, number>();
  function getJitterY(tx: Transaction): number {
    const key = tx.date;
    const count = dateCounts.get(key) || 1;
    const idx = dateGroupIndex.get(key) || 0;
    dateGroupIndex.set(key, idx + 1);

    if (count <= 1) return chartHeight / 2;

    // Spread dots evenly across the chart height with padding
    const padding = 15;
    const availableHeight = chartHeight - padding * 2;
    const step = availableHeight / (count - 1);
    return padding + idx * step;
  }

  // ── AXIS TICKS ──
  // Generate tick positions along the x-axis. scaleTime.ticks() returns
  // "nice" date values (start of months, quarters, etc.) based on the
  // data range.
  const ticks = xScale.ticks(Math.max(Math.floor(chartWidth / 120), 2));
  const formatTick = timeFormat("%b %Y");

  // Deduplicate ticks that format to the same label (happens when date
  // range is very narrow, e.g., all trades on one day)
  const seenLabels = new Set<string>();
  const dedupedTicks = ticks.filter((tick) => {
    const label = formatTick(tick);
    if (seenLabels.has(label)) return false;
    seenLabels.add(label);
    return true;
  });

  return (
    <div ref={containerRef} className="relative mb-10">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
        Transaction Timeline
      </h2>

      <svg
        width={width}
        height={height}
        className="overflow-visible"
        role="img"
        aria-label="Transaction timeline showing trades over time"
      >
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* ── X-AXIS ──
              We render the axis manually with React instead of using D3's
              axis generator (d3.axisBottom). This keeps React in control
              of the DOM. Each tick is a line + text label. */}

          {/* Baseline */}
          <line
            x1={0}
            y1={chartHeight}
            x2={chartWidth}
            y2={chartHeight}
            stroke="#d4d4d4"
          />

          {/* Tick marks and labels */}
          {dedupedTicks.map((tick, i) => {
            const x = xScale(tick);
            return (
              <g key={i} transform={`translate(${x}, ${chartHeight})`}>
                <line y1={0} y2={6} stroke="#a3a3a3" />
                <text
                  y={20}
                  textAnchor="middle"
                  className="fill-neutral-400 text-[11px]"
                >
                  {formatTick(tick)}
                </text>
              </g>
            );
          })}

          {/* ── DATA POINTS ──
              Each transaction becomes a circle positioned by date (x) and
              centered vertically (y). Color encodes type, radius encodes
              amount. We render sales first so purchases layer on top
              (purchases are more noteworthy for accountability). */}
          {parsedData
            .sort((a, b) => b.amount - a.amount) // Larger dots behind
            .map((d, i) => {
              const cx = xScale(d.date);
              const cy = getJitterY(d.tx);
              const r = rScale(d.amount);
              const sale = isSale(d.tx.type);
              const purchase = d.tx.type === "Purchase";

              return (
                <circle
                  key={`${d.tx.date}-${d.tx.description}-${i}`}
                  cx={cx}
                  cy={cy}
                  r={r}
                  className={`transition-opacity duration-150 ${
                    sale
                      ? "fill-red-600"
                      : purchase
                        ? "fill-emerald-600"
                        : "fill-neutral-400"
                  }`}
                  opacity={
                    tooltip
                      ? tooltip.tx === d.tx
                        ? 0.9
                        : 0.25
                      : 0.7
                  }
                  stroke={
                    d.tx.lateFilingFlag
                      ? "#b45309" // amber-700 ring for late filings
                      : "white"
                  }
                  strokeWidth={d.tx.lateFilingFlag ? 2.5 : 1.5}
                  onMouseEnter={() =>
                    setTooltip({ tx: d.tx, x: cx + margin.left, y: cy })
                  }
                  onMouseLeave={() => setTooltip(null)}
                  style={{ cursor: "pointer" }}
                />
              );
            })}
        </g>
      </svg>

      {/* ── TOOLTIP ──
          Rendered as a React div positioned absolutely over the SVG.
          This is easier to style than SVG foreignObject and supports
          full CSS/HTML. */}
      {tooltip && (
        <div
          className="absolute pointer-events-none bg-white border border-neutral-200 shadow-sm px-3 py-2 text-xs max-w-60 z-10"
          style={{
            left: Math.min(tooltip.x, width - 220),
            top: tooltip.y - 80,
          }}
        >
          <div className="font-medium text-neutral-900 mb-1">
            {tooltip.tx.description}
          </div>
          <div className="text-neutral-500 space-y-0.5">
            <div>{formatDate(tooltip.tx.date)}</div>
            <div>
              <span
                className={
                  isSale(tooltip.tx.type)
                    ? "text-red-700"
                    : tooltip.tx.type === "Purchase"
                      ? "text-emerald-700"
                      : ""
                }
              >
                {tooltip.tx.type}
              </span>{" "}
              · {amountRangeLabel(tooltip.tx.amount)}
            </div>
            {tooltip.tx.ticker && <div>Ticker: {tooltip.tx.ticker}</div>}
            {tooltip.tx.lateFilingFlag && (
              <div className="text-amber-700 font-medium">Late filing</div>
            )}
          </div>
        </div>
      )}

      {/* ── LEGEND ── */}
      <div className="flex gap-4 mt-3 text-xs text-neutral-400">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 opacity-70" />
          Sale
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600 opacity-70" />
          Purchase
        </div>
        <div className="text-neutral-300">|</div>
        <div>Circle size = transaction amount</div>
      </div>
    </div>
  );
}
