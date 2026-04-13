"use client";

import { useRef, useEffect, useState } from "react";
import { treemap, hierarchy, treemapSquarify } from "d3-hierarchy";
import { scaleOrdinal } from "d3-scale";
import { formatCompactCurrency } from "@/lib/format";

/**
 * TREEMAP — Asset Category Breakdown
 *
 * D3 Hierarchy Concepts:
 *
 * 1. hierarchy(): Takes nested data and creates a tree structure with
 *    parent/child relationships, computing things like depth and height.
 *
 * 2. treemap(): A LAYOUT function that takes a hierarchy and computes
 *    x0, y0, x1, y1 coordinates for each node — the rectangle positions.
 *    It doesn't draw anything; it just computes geometry.
 *
 * 3. treemapSquarify: The TILING ALGORITHM. Determines how rectangles are
 *    arranged. Squarify produces rectangles with aspect ratios close to 1
 *    (i.e., as square-ish as possible), which makes labels easier to read
 *    and sizes easier to compare than long thin strips.
 *
 * 4. The COLOR MAPPING uses scaleOrdinal — it maps category names to a
 *    fixed palette. Unlike scaleLinear (continuous), scaleOrdinal maps
 *    discrete values to discrete outputs.
 */

interface TreemapEntry {
  name: string;
  value: number;
}

export default function SectorTreemap({ data }: { data: TreemapEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hovered, setHovered] = useState<string | null>(null);

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

  const height = 260;

  // Don't render until we have a measured width
  if (width <= 0) {
    return (
      <section>
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-6">
          Transaction volume by asset category
        </h2>
        <div ref={containerRef} className="h-[260px]" />
      </section>
    );
  }

  // Build hierarchy from flat data. D3 hierarchy expects a root node
  // with children, so we wrap our data array in a parent object.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const root = hierarchy<any>({ name: "root", children: data })
    .sum((d: any) => d.value || 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  // Compute the treemap layout — this mutates the hierarchy nodes,
  // adding x0, y0, x1, y1 properties to each leaf.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  treemap<any>()
    .size([width, height])
    .padding(2)
    .tile(treemapSquarify)(root);

  // Muted editorial palette — distinct enough to read, not dashboard-rainbow.
  // Each category gets its own hue so the treemap is scannable at a glance.
  const colorScale = scaleOrdinal<string>()
    .domain(data.map((d) => d.name))
    .range([
      "#292524", // stone-800 (largest)
      "#1e3a5f", // dark navy
      "#5b4a3f", // warm brown
      "#3d5a47", // forest green
      "#6b4c5e", // muted plum
      "#4a6670", // slate teal
      "#7a6340", // bronze
      "#5c5c7a", // dusty indigo
    ]);

  // After treemap() runs, each node has x0, y0, x1, y1 added.
  // TypeScript doesn't know about these layout-computed properties,
  // so we cast to access them.
  interface TreemapNode {
    data: TreemapEntry;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    value: number;
  }
  const leaves = root.leaves() as unknown as TreemapNode[];
  const totalValue = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-6">
        Transaction volume by asset category
      </h2>

      <div ref={containerRef} className="relative">
        <svg width={width} height={height}>
          {leaves.map((leaf) => {
            const d = leaf.data;
            const x0 = leaf.x0;
            const y0 = leaf.y0;
            const x1 = leaf.x1;
            const y1 = leaf.y1;
            const w = x1 - x0;
            const h = y1 - y0;
            const pct = totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(0) : "0";
            const isSmall = w < 80 || h < 40;
            const isHovered = hovered === d.name;
            const color = colorScale(d.name);
            const isLight = false; // all colors are dark now — always use white text

            return (
              <g
                key={d.name}
                onMouseEnter={() => setHovered(d.name)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "default" }}
              >
                <rect
                  x={x0}
                  y={y0}
                  width={w}
                  height={h}
                  fill={color}
                  opacity={hovered ? (isHovered ? 1 : 0.5) : 0.9}
                  className="transition-opacity duration-150"
                />
                {!isSmall && (
                  <>
                    <text
                      x={x0 + 6}
                      y={y0 + 16}
                      className={`text-[11px] font-medium ${isLight ? "fill-neutral-700" : "fill-white"}`}
                    >
                      {d.name}
                    </text>
                    <text
                      x={x0 + 6}
                      y={y0 + 30}
                      className={`text-[10px] ${isLight ? "fill-neutral-500" : "fill-white/70"}`}
                    >
                      {formatCompactCurrency(d.value)} ({pct}%)
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {hovered && (
          <div className="absolute top-2 right-2 bg-white border border-neutral-200 shadow-sm px-3 py-2 text-xs z-10">
            <div className="font-medium text-neutral-900">{hovered}</div>
            <div className="text-neutral-500">
              {formatCompactCurrency(
                data.find((d) => d.name === hovered)?.value ?? 0
              )}{" "}
              (
              {totalValue > 0
                ? (
                    ((data.find((d) => d.name === hovered)?.value ?? 0) /
                      totalValue) *
                    100
                  ).toFixed(1)
                : "0"}
              %)
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
