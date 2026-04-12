"use client";

import { useRef, useEffect, useState } from "react";
import { scaleLinear, scaleBand } from "d3-scale";
import { formatCompactCurrency, displayName } from "@/lib/format";

/**
 * HORIZONTAL BAR CHART — Who traded this stock?
 *
 * D3 concepts used:
 * - scaleBand: Maps categorical data (official names) to evenly-spaced
 *   bands along the y-axis. Unlike scaleLinear which maps numbers,
 *   scaleBand maps strings to pixel positions with built-in padding.
 * - scaleLinear: Maps dollar values to bar widths on the x-axis.
 */

interface OfficialBar {
  name: string;
  slug: string;
  title: string;
  agency: string;
  totalValue: number;
  tradeCount: number;
}

export default function CompanyBarChart({
  officials,
  ticker,
}: {
  officials: OfficialBar[];
  ticker: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

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

  const margin = { top: 10, right: 80, bottom: 10, left: 160 };
  const barHeight = 28;
  const height = officials.length * barHeight + margin.top + margin.bottom;
  const chartWidth = width - margin.left - margin.right;

  // scaleBand: one band per official, maps names to y-positions
  const yScale = scaleBand()
    .domain(officials.map((o) => o.name))
    .range([0, officials.length * barHeight])
    .padding(0.25);

  // scaleLinear: maps dollar values to bar widths
  const maxValue = Math.max(...officials.map((o) => o.totalValue));
  const xScale = scaleLinear()
    .domain([0, maxValue])
    .range([0, chartWidth]);

  return (
    <div ref={containerRef} className="mb-10">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-4">
        Estimated transaction volume by official
      </h2>

      <svg width={width} height={height}>
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {officials.map((o) => {
            const y = yScale(o.name) ?? 0;
            const barW = xScale(o.totalValue);
            const bandHeight = yScale.bandwidth();

            return (
              <g key={o.slug}>
                {/* Official name label */}
                <text
                  x={-8}
                  y={y + bandHeight / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="#44403c" className="text-[12px]"
                >
                  {displayName(o.name).length > 20
                    ? displayName(o.name).substring(0, 18) + "..."
                    : displayName(o.name)}
                </text>

                {/* Bar */}
                <rect
                  x={0}
                  y={y}
                  width={Math.max(barW, 2)}
                  height={bandHeight}
                  fill="#292524"
                  rx={1}
                />

                {/* Value label */}
                <text
                  x={barW + 6}
                  y={y + bandHeight / 2}
                  dominantBaseline="middle"
                  fill="#a8a29e" className="text-[11px]"
                >
                  {formatCompactCurrency(o.totalValue)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
