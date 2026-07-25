"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import type { OfficialIndexEntry } from "@/lib/types";
import { formatDate, displayName } from "@/lib/format";
import { officeLine, officeLineShort } from "@/lib/office-line";
import type { MonthBucket } from "@/lib/monthly-activity";
import OfficialAvatar from "./official-avatar";
import ActivitySparkline from "./activity-sparkline";

type SortKey = "name" | "transactionCount" | "mostRecentFilingDate";
type SortDirection = "asc" | "desc";

/**
 * Column template, one place so the header row, every data row and the month
 * axis stay locked to the same grid. The axis has to sit under the Activity
 * column exactly, which is only reliable if all three share this string.
 */
const GRID_COLS =
  "grid-cols-[1fr_auto] sm:grid-cols-[1fr_64px_1fr_108px] min-[900px]:grid-cols-[296px_68px_1fr_118px]";

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Quarterly ticks, with the year appended only in January so the axis reads
 * "Jan 25 · Apr · Jul · Oct · Jan 26 · Apr" rather than repeating the year
 * six times.
 */
function axisTicks(months: string[]) {
  const ticks: { label: string; leftPct: number }[] = [];
  months.forEach((monthKey, i) => {
    const monthNumber = Number(monthKey.slice(5, 7));
    if (monthNumber % 3 !== 1) return;
    const abbr = MONTH_ABBR[monthNumber - 1];
    ticks.push({
      label: monthNumber === 1 ? `${abbr} ${monthKey.slice(2, 4)}` : abbr,
      // Centre of the slot, matching where the sparkline draws that month.
      leftPct: ((i + 0.5) / months.length) * 100,
    });
  });
  return ticks;
}

export default function OfficialsTable({
  officials,
  initialLimit,
  newIngestedCutoff,
  activityBySlug,
  months,
}: {
  officials: OfficialIndexEntry[];
  initialLimit?: number;
  // YYYY-MM-DD; officials ingested on or after this date get a "New" badge
  newIngestedCutoff?: string;
  activityBySlug: Record<string, MonthBucket[]>;
  months: string[];
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("transactionCount");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [showAll, setShowAll] = useState(!initialLimit);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "transactionCount" ? "desc" : "asc");
    }
  }

  /**
   * One sort, no pinning.
   *
   * Recently-updated officials used to be re-sorted to the top of the default
   * view, which left the Trades column reading 7,699 / 89 / 78 / 62 / 25 /
   * 306 — non-monotonic in the table's own headline column, and it forced the
   * sort arrow to be suppressed because the order matched no column. The
   * banner above the page already names the recent filers with per-filing
   * trade deltas, and the New badges still mark them in place here, so
   * nothing is lost by letting the column sort mean what it says.
   */
  const sorted = officials.toSorted((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "name":
        return dir * a.name.localeCompare(b.name);
      case "transactionCount":
        return dir * (a.transactionCount - b.transactionCount);
      case "mostRecentFilingDate":
        return (
          dir * a.mostRecentFilingDate.localeCompare(b.mostRecentFilingDate)
        );
      default:
        return 0;
    }
  });

  const visible = showAll ? sorted : sorted.slice(0, initialLimit);
  const arrow = sortDir === "asc" ? " ↑" : " ↓";
  const ticks = axisTicks(months);

  const isNew = (official: OfficialIndexEntry) =>
    !!newIngestedCutoff &&
    (official.lastIngestedDate ?? "") >= newIngestedCutoff;

  return (
    <div>
      {/* Header row */}
      <div
        className={`grid ${GRID_COLS} gap-x-[14px] items-end border-b border-neutral-900 pb-2 text-xs uppercase tracking-wider text-neutral-500`}
      >
        <button
          type="button"
          onClick={() => handleSort("name")}
          className="text-left font-medium hover:text-neutral-900 transition-colors cursor-pointer"
        >
          Name &amp; office{sortKey === "name" ? arrow : ""}
        </button>
        <button
          type="button"
          onClick={() => handleSort("transactionCount")}
          className="text-right font-medium hover:text-neutral-900 transition-colors cursor-pointer"
        >
          Trades{sortKey === "transactionCount" ? arrow : ""}
        </button>
        <span className="hidden sm:block font-medium">Activity, monthly</span>
        <button
          type="button"
          onClick={() => handleSort("mostRecentFilingDate")}
          className="hidden sm:block text-right font-medium hover:text-neutral-900 transition-colors cursor-pointer"
        >
          Latest OGE filing
          {sortKey === "mostRecentFilingDate" ? arrow : ""}
        </button>
      </div>

      {/* Rows */}
      {visible.map((official, i) => (
        <div
          key={official.slug}
          onClick={() => router.push(`/officials/${official.slug}`)}
          className={`grid ${GRID_COLS} gap-x-[14px] gap-y-1.5 items-center border-b border-neutral-100 py-2.5 cursor-pointer transition-colors hover:bg-neutral-100 ${
            i % 2 === 1 ? "bg-neutral-50/50" : ""
          }`}
        >
          {/* Name & office */}
          <div className="flex items-center gap-2.5 min-w-0">
            <OfficialAvatar
              name={official.name}
              slug={official.slug}
              party={official.party}
              size={28}
            />
            <div className="min-w-0">
              <Link
                href={`/officials/${official.slug}`}
                className="block text-[13px] text-neutral-900 hover:underline truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {displayName(official.name)}
              </Link>
              <div
                className="text-[11px] text-neutral-500 truncate"
                title={officeLine(official.title, official.agency)}
              >
                {official.departedDate && (
                  <span
                    className="uppercase tracking-wider text-amber-700 font-medium mr-1"
                    title={`Departed ${formatDate(official.departedDate)}`}
                  >
                    Former
                  </span>
                )}
                {officeLineShort(official.title, official.agency)}
              </div>
            </div>
          </div>

          {/* Trades */}
          <div className="text-right text-[13px] font-semibold tabular-nums font-[family-name:var(--font-dm-mono)] text-neutral-900 whitespace-nowrap">
            {official.transactionCount.toLocaleString()}
            <span className="sm:hidden text-[11px] font-normal text-neutral-500">
              {" "}
              trades
            </span>
          </div>

          {/* Activity, monthly. Spans the full width on phones, where it gets
              more room than it does in the desktop column. */}
          <div className="col-span-2 sm:col-span-1 min-w-0">
            <ActivitySparkline
              buckets={activityBySlug[official.slug] ?? []}
            />
          </div>

          {/* Latest OGE filing */}
          <div className="col-span-2 sm:col-span-1 text-[10.5px] sm:text-[13px] text-left sm:text-right text-neutral-500 tabular-nums whitespace-nowrap">
            <span className="inline-flex items-center gap-1.5">
              {isNew(official) && (
                <span
                  className="bg-neutral-900 text-white text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5"
                  title={`New OGE filing ${formatDate(official.mostRecentFilingDate)}`}
                >
                  New
                </span>
              )}
              {formatDate(official.mostRecentFilingDate)}
            </span>
          </div>
        </div>
      ))}

      {/* Shared month axis, aligned to the Activity column */}
      <div className={`grid ${GRID_COLS} gap-x-[14px] mt-1.5`}>
        <div className="hidden sm:block" />
        <div className="hidden sm:block" />
        <div className="relative h-4 col-span-2 sm:col-span-1">
          {ticks.map((tick) => (
            <span
              key={tick.label + tick.leftPct}
              className="absolute top-0 -translate-x-1/2 text-[10px] text-neutral-500 whitespace-nowrap"
              style={{ left: `${tick.leftPct}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
        <div className="hidden sm:block" />
      </div>

      <p className="text-[11px] leading-[1.45] text-neutral-500 mt-2">
        Sales above the line, purchases below &middot; dashed rule =
        inauguration &middot;{" "}
        <strong className="font-semibold text-neutral-700">
          each row is scaled to its own busiest month
        </strong>{" "}
        &mdash; the sparkline shows <em>when</em> an official traded, not how
        much relative to others. Use the Trades column for magnitude.
      </p>

      {!showAll && initialLimit && sorted.length > initialLimit && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-4 w-full py-2.5 text-sm text-neutral-600 hover:text-neutral-900 border border-neutral-200 hover:border-neutral-400 transition-colors cursor-pointer"
        >
          Show all {sorted.length} officials
        </button>
      )}
    </div>
  );
}
