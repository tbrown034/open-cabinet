"use client";

import { useRef, useEffect, useState } from "react";
import { scaleTime, scaleSqrt, scaleBand } from "d3-scale";
import { extent } from "d3-array";
import { timeFormat } from "d3-time-format";
import Link from "next/link";
import {
  amountRangeToMin,
  amountRangeLabel,
  formatDate,
  displayName,
} from "@/lib/format";

interface PreviewTx {
  description: string;
  ticker: string | null;
  type: string;
  date: string;
  amount: string;
  isSale: boolean;
}

export interface PreviewOfficial {
  name: string;
  slug: string;
  title: string;
  transactions: PreviewTx[];
}

interface TooltipData {
  tx: PreviewTx;
  officialName: string;
  x: number;
  y: number;
}

const TOP_COUNT = 8;
const LANE_HEIGHT = 34;
const MAX_R = 8;
const MIN_R = 2;

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
  const chartHeight = top.length * (isMobile ? 46 : LANE_HEIGHT);
  const height = chartHeight + margin.top + margin.bottom;

  const yScale = scaleBand()
    .domain(top.map((o) => o.name))
    .range([0, chartHeight])
    .padding(0.25);

  const allDates = top.flatMap((o) =>
    o.transactions.map((tx) => new Date(tx.date + "T00:00:00"))
  );
  const dateExtent = extent(allDates) as [Date, Date];
  const dayPad = 14 * 24 * 60 * 60 * 1000;
  const xScale = scaleTime()
    .domain(
      dateExtent[0]
        ? [
            new Date(dateExtent[0].getTime() - dayPad),
            new Date(dateExtent[1].getTime() + dayPad),
          ]
        : [new Date("2025-01-01"), new Date("2026-04-01")]
    )
    .range([0, chartWidth]);

  const allAmounts = top.flatMap((o) =>
    o.transactions.map((tx) => amountRangeToMin(tx.amount as never))
  );
  const amountExtent = extent(allAmounts) as [number, number];
  const rScale = scaleSqrt()
    .domain([
      amountExtent[0] ?? 0,
      Math.max(amountExtent[1] ?? 1, (amountExtent[0] ?? 0) + 1),
    ])
    .range([MIN_R, MAX_R]);

  const ticks = xScale.ticks(Math.max(Math.floor(chartWidth / 140), 3));
  const formatTick = timeFormat("%b %Y");

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
              <g key={o.slug}>
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
                      className="text-[11px]"
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

          {top.flatMap((o) =>
            o.transactions.map((tx, i) => {
              const y = yScale(o.name) ?? 0;
              const bandHeight = yScale.bandwidth();
              const cx = xScale(new Date(tx.date + "T00:00:00"));
              const cy = isMobile ? y + bandHeight * 0.72 : y + bandHeight / 2;
              const r = rScale(amountRangeToMin(tx.amount as never));
              return (
                <circle
                  key={`${o.slug}-${i}`}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={tx.isSale ? "#dc2626" : "#16a34a"}
                  opacity={
                    tooltip
                      ? tooltip.tx === tx && tooltip.officialName === o.name
                        ? 1
                        : 0.2
                      : 0.75
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
            · {amountRangeLabel(tooltip.tx.amount as never)}
            {tooltip.tx.ticker && ` · ${tooltip.tx.ticker}`}
          </div>
        </div>
      )}

      <div className="mt-2 flex justify-end">
        <Link
          href="/all"
          className="text-[11px] text-neutral-500 hover:text-neutral-900 underline"
        >
          View all {totalOfficials}{" "}officials &rarr;
        </Link>
      </div>
    </div>
  );
}
