"use client";

import { useRef, useEffect, useState } from "react";
import { scaleTime, scaleSqrt } from "d3-scale";
import { timeFormat } from "d3-time-format";
import { extent } from "d3-array";
import type { Transaction } from "@/lib/types";
import { amountRangeToMin, amountRangeLabel, formatDate } from "@/lib/format";

/**
 * TRANSACTION TIMELINE — D3 + React Integration
 *
 * Uses "D3 for math, React for DOM": D3 computes scales and positions,
 * React renders SVG elements and manages state (tooltips, hover).
 *
 * Two layout modes:
 * - TIMELINE: When date range > 7 days. Horizontal timeline, x = date.
 * - COMPACT GRID: When all trades cluster in ≤7 days. Dots arranged in
 *   a packed grid, sorted by amount. Shows density without wasting space.
 */

interface CareerEvent {
  date: string;
  label: string;
  style: "solid" | "dashed" | "dotted";
  color: string;
}

interface TimelineProps {
  transactions: Transaction[];
  careerEvents?: CareerEvent[];
}

interface TooltipData {
  tx: Transaction;
  x: number;
  y: number;
}

function isSale(type: Transaction["type"]): boolean {
  return type === "Sale" || type === "Sale (Partial)" || type === "Sale (Full)";
}

function getDotColor(tx: Transaction): string {
  if (isSale(tx.type)) return "fill-red-600";
  if (tx.type === "Purchase") return "fill-emerald-600";
  return "fill-neutral-400";
}

export default function TransactionTimeline({ transactions, careerEvents = [] }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

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

  // Determine if we should use compact mode
  const dates = transactions.map((tx) => new Date(tx.date + "T00:00:00"));
  const dateMin = Math.min(...dates.map((d) => d.getTime()));
  const dateMax = Math.max(...dates.map((d) => d.getTime()));
  const dateRangeDays = (dateMax - dateMin) / (1000 * 60 * 60 * 24);
  const useCompactMode = dateRangeDays < 7;

  if (useCompactMode) {
    return (
      <CompactGrid
        transactions={transactions}
        width={width}
        containerRef={containerRef}
        tooltip={tooltip}
        setTooltip={setTooltip}
      />
    );
  }

  return (
    <TimelineView
      transactions={transactions}
      careerEvents={careerEvents}
      width={width}
      containerRef={containerRef}
      tooltip={tooltip}
      setTooltip={setTooltip}
    />
  );
}

// ── COMPACT GRID ──
// For single-day or narrow-range clusters. Arranges dots in rows,
// sorted by amount (largest first). Dense and informative.
function CompactGrid({
  transactions,
  width,
  containerRef,
  tooltip,
  setTooltip,
}: {
  transactions: Transaction[];
  width: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  tooltip: TooltipData | null;
  setTooltip: (t: TooltipData | null) => void;
}) {
  const margin = { top: 10, right: 10, bottom: 10, left: 10 };
  const chartWidth = width - margin.left - margin.right;

  const parsedData = transactions
    .map((tx) => ({
      tx,
      amount: amountRangeToMin(tx.amount),
    }))
    .sort((a, b) => b.amount - a.amount);

  const amountExtent = extent(parsedData, (d) => d.amount) as [number, number];
  const rScale = scaleSqrt()
    .domain([amountExtent[0], Math.max(amountExtent[1], amountExtent[0] + 1)])
    .range([6, 22]);

  // Pack dots into rows left-to-right, wrapping when they'd overflow
  const dotSpacing = 4;
  const positions: { x: number; y: number; r: number; idx: number }[] = [];
  let rowX = 0;
  let rowY = 0;
  let rowMaxR = 0;

  parsedData.forEach((d, i) => {
    const r = rScale(d.amount);
    if (rowX + r * 2 + dotSpacing > chartWidth && rowX > 0) {
      rowX = 0;
      rowY += rowMaxR * 2 + dotSpacing;
      rowMaxR = 0;
    }
    positions.push({ x: rowX + r, y: rowY + r, r, idx: i });
    rowX += r * 2 + dotSpacing;
    rowMaxR = Math.max(rowMaxR, r);
  });

  const totalHeight =
    (positions.length > 0
      ? Math.max(...positions.map((p) => p.y + p.r))
      : 40) +
    margin.top +
    margin.bottom;

  const dateLabel = formatDate(transactions[0].date);
  const uniqueDates = new Set(transactions.map((tx) => tx.date));
  const saleCount = transactions.filter((tx) => isSale(tx.type)).length;
  const purchaseCount = transactions.filter((tx) => tx.type === "Purchase").length;
  const isSingleDay = uniqueDates.size === 1;

  // Build a human-readable description of what happened
  let contextNote = "";
  if (isSingleDay && transactions.length > 10) {
    if (saleCount === transactions.length) {
      contextNote = `All ${transactions.length} transactions were sales on a single day — consistent with a coordinated divestiture.`;
    } else if (purchaseCount === transactions.length) {
      contextNote = `All ${transactions.length} transactions were purchases on a single day.`;
    } else {
      contextNote = `${transactions.length} transactions filed on a single day — ${saleCount} sales and ${purchaseCount} purchases.`;
    }
  } else if (uniqueDates.size <= 3 && transactions.length > 10) {
    contextNote = `${transactions.length} transactions across ${uniqueDates.size} days.`;
  }

  return (
    <div ref={containerRef} className="relative mb-10">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-1">
        {isSingleDay ? "Single-day filing" : "Transactions"}
      </h2>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-sm font-medium text-neutral-900">{dateLabel}</span>
        <span className="text-xs text-neutral-400">
          {transactions.length} transactions
        </span>
      </div>
      {contextNote && (
        <p className="text-xs text-neutral-500 mb-4 max-w-md leading-relaxed">
          {contextNote}
        </p>
      )}

      <svg width={width} height={totalHeight} className="overflow-visible">
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {positions.map((pos) => {
            const d = parsedData[pos.idx];
            return (
              <circle
                key={`${d.tx.description}-${pos.idx}`}
                cx={pos.x}
                cy={pos.y}
                r={pos.r}
                className={`transition-opacity duration-150 ${getDotColor(d.tx)}`}
                opacity={
                  tooltip
                    ? tooltip.tx === d.tx
                      ? 0.9
                      : 0.25
                    : 0.7
                }
                stroke={d.tx.lateFilingFlag ? "#b45309" : "white"}
                strokeWidth={d.tx.lateFilingFlag ? 2.5 : 1.5}
                onMouseEnter={() =>
                  setTooltip({
                    tx: d.tx,
                    x: pos.x + margin.left,
                    y: pos.y + margin.top,
                  })
                }
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: "pointer" }}
              />
            );
          })}
        </g>
      </svg>

      <Tooltip tooltip={tooltip} width={width} />
      <Legend />
    </div>
  );
}

// ── TIMELINE VIEW ──
// Horizontal timeline for officials with trades across multiple dates.
function TimelineView({
  transactions,
  careerEvents = [],
  width,
  containerRef,
  tooltip,
  setTooltip,
}: {
  transactions: Transaction[];
  careerEvents?: CareerEvent[];
  width: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  tooltip: TooltipData | null;
  setTooltip: (t: TooltipData | null) => void;
}) {
  const margin = { top: 28, right: 20, bottom: 40, left: 20 };

  // Dynamic height based on how many trades share a single date
  const dateCounts = new Map<string, number>();
  transactions.forEach((tx) => {
    dateCounts.set(tx.date, (dateCounts.get(tx.date) || 0) + 1);
  });
  const maxSameDay = Math.max(...dateCounts.values());
  const height = Math.max(160, Math.min(300, maxSameDay * 16 + 60));

  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const parsedData = transactions.map((tx) => ({
    tx,
    date: new Date(tx.date + "T00:00:00"),
    amount: amountRangeToMin(tx.amount),
  }));

  // scaleTime maps dates to x-pixel positions
  // Extend domain to include career events (confirmation, deadline)
  const dateExtent = extent(parsedData, (d) => d.date) as [Date, Date];
  const eventDates = careerEvents.map((e) => new Date(e.date + "T00:00:00").getTime());
  const allTimestamps = [dateExtent[0].getTime(), dateExtent[1].getTime(), ...eventDates];
  const domainMin = Math.min(...allTimestamps);
  const domainMax = Math.max(...allTimestamps);
  const dayPadding = 14 * 24 * 60 * 60 * 1000;
  const xScale = scaleTime()
    .domain([
      new Date(domainMin - dayPadding),
      new Date(domainMax + dayPadding),
    ])
    .range([0, chartWidth]);

  // scaleSqrt maps amounts to radii (area scales linearly with value)
  const amountExtent = extent(parsedData, (d) => d.amount) as [number, number];
  const rScale = scaleSqrt()
    .domain([amountExtent[0], Math.max(amountExtent[1], amountExtent[0] + 1)])
    .range([5, 20]);

  // Jittering for same-day trades
  const dateGroupIndex = new Map<string, number>();
  function getJitterY(tx: Transaction): number {
    const key = tx.date;
    const count = dateCounts.get(key) || 1;
    const idx = dateGroupIndex.get(key) || 0;
    dateGroupIndex.set(key, idx + 1);
    if (count <= 1) return chartHeight / 2;
    const padding = 12;
    const available = chartHeight - padding * 2;
    const step = available / (count - 1);
    return padding + idx * step;
  }

  const ticks = xScale.ticks(Math.max(Math.floor(chartWidth / 120), 2));
  const formatTick = timeFormat("%b %Y");
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
          {/* Career event marker lines — rendered before dots so dots are on top */}
          {careerEvents.map((event, i) => {
            const x = xScale(new Date(event.date + "T00:00:00"));
            const strokeDash = event.style === "dashed" ? "4,4" : event.style === "dotted" ? "2,3" : "none";
            return (
              <g key={`event-${i}`}>
                <line
                  x1={x}
                  y1={-8}
                  x2={x}
                  y2={chartHeight}
                  stroke={event.color}
                  strokeWidth={1}
                  strokeDasharray={strokeDash}
                />
                <text
                  x={x}
                  y={-12}
                  textAnchor="middle"
                  fill={event.color}
                  className="text-[9px]"
                >
                  {event.label}
                </text>
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

          {dedupedTicks.map((tick, i) => {
            const x = xScale(tick);
            return (
              <g key={i} transform={`translate(${x}, ${chartHeight})`}>
                <line y1={0} y2={6} stroke="#a3a3a3" />
                <text
                  y={20}
                  textAnchor="middle"
                  fill="#a8a29e" className="text-[11px]"
                >
                  {formatTick(tick)}
                </text>
              </g>
            );
          })}

          {parsedData
            .sort((a, b) => b.amount - a.amount)
            .map((d, i) => {
              const cx = xScale(d.date);
              const cy = getJitterY(d.tx);
              const r = rScale(d.amount);

              return (
                <circle
                  key={`${d.tx.date}-${d.tx.description}-${i}`}
                  cx={cx}
                  cy={cy}
                  r={r}
                  className={`transition-opacity duration-150 ${getDotColor(d.tx)}`}
                  opacity={
                    tooltip
                      ? tooltip.tx === d.tx
                        ? 0.9
                        : 0.25
                      : 0.7
                  }
                  stroke={d.tx.lateFilingFlag ? "#b45309" : "white"}
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

      <Tooltip tooltip={tooltip} width={width} />
      <Legend />
    </div>
  );
}

function Tooltip({
  tooltip,
  width,
}: {
  tooltip: TooltipData | null;
  width: number;
}) {
  if (!tooltip) return null;
  return (
    <div
      className="absolute pointer-events-none bg-white border border-neutral-200 shadow-sm px-3 py-2 text-xs max-w-60 z-10"
      style={{
        left: Math.min(tooltip.x, width - 220),
        top: Math.max(tooltip.y - 80, 0),
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
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-neutral-400">
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 opacity-70" />
        Sale
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600 opacity-70" />
        Purchase
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full bg-neutral-300"
          style={{ border: "2px solid #b45309" }}
        />
        Late filing
      </div>
      <div className="text-neutral-300">|</div>
      <div>Circle size = transaction amount</div>
    </div>
  );
}
