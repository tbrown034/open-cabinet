"use client";

import { useState } from "react";
import Link from "next/link";
import type { OfficialIndexEntry } from "@/lib/types";
import { formatDate, displayName } from "@/lib/format";
import OfficialAvatar from "./official-avatar";

type SortKey = "name" | "agency" | "transactionCount" | "mostRecentFilingDate";
type SortDirection = "asc" | "desc";

export default function OfficialsTable({
  officials,
  initialLimit,
  newIngestedCutoff,
}: {
  officials: OfficialIndexEntry[];
  initialLimit?: number;
  // YYYY-MM-DD; officials whose mostRecentFilingDate >= this get a "New" badge
  newIngestedCutoff?: string;
}) {
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

  const sorted = [...officials].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "name":
        return dir * a.name.localeCompare(b.name);
      case "agency":
        return dir * a.agency.localeCompare(b.agency);
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

  // When a cutoff is set, surface every "New" official in the default view
  // by re-sorting recent filings to the top. Inside each group we preserve
  // the chosen sort. The user can still click any header to override.
  const newGroupingActive =
    !!newIngestedCutoff && sortKey === "transactionCount" && sortDir === "desc";
  const displaySorted = newGroupingActive
    ? [...sorted].sort((a, b) => {
        const aNew = (a.lastIngestedDate ?? "") >= newIngestedCutoff! ? 1 : 0;
        const bNew = (b.lastIngestedDate ?? "") >= newIngestedCutoff! ? 1 : 0;
        if (aNew !== bNew) return bNew - aNew; // new first
        return 0; // stable: preserve existing tx-count sort
      })
    : sorted;

  // The arrow indicates which column drives the displayed order. When the
  // NEW-first grouping is active, the visible order does NOT match either
  // column's pure sort (Vaden's 6 trades sits above Mody's 306 because
  // Vaden is newly added) — so suppressing the arrow is the honest move,
  // and a caption above the table explains the grouping instead.
  const arrow = sortDir === "asc" ? " ↑" : " ↓";
  const showSortArrow = !newGroupingActive;

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      {newGroupingActive && (
        <p className="text-xs text-neutral-500 mb-2 italic">
          Officials with filings in the last 14 days surface at the top.
          Click any column header to sort the table by that column instead.
        </p>
      )}
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-neutral-900 text-xs uppercase tracking-wider text-neutral-500">
            <th className="pb-2 pr-4 font-medium">
              <button
                onClick={() => handleSort("name")}
                className="hover:text-neutral-900 transition-colors cursor-pointer"
              >
                Name{showSortArrow && sortKey === "name" ? arrow : ""}
              </button>
            </th>
            <th className="pb-2 pr-4 font-medium hidden md:table-cell">
              <button
                onClick={() => handleSort("agency")}
                className="hover:text-neutral-900 transition-colors cursor-pointer"
              >
                Agency{showSortArrow && sortKey === "agency" ? arrow : ""}
              </button>
            </th>
            <th className="pb-2 pr-4 font-medium text-right">
              <button
                onClick={() => handleSort("transactionCount")}
                className="hover:text-neutral-900 transition-colors cursor-pointer"
              >
                Trades{showSortArrow && sortKey === "transactionCount" ? arrow : ""}
              </button>
            </th>
            <th className="pb-2 font-medium text-right hidden sm:table-cell">
              <button
                onClick={() => handleSort("mostRecentFilingDate")}
                className="hover:text-neutral-900 transition-colors cursor-pointer"
              >
                Latest filing
                {showSortArrow && sortKey === "mostRecentFilingDate" ? arrow : ""}
              </button>
            </th>
          </tr>
        </thead>
        <tbody className="text-sm">
          {(showAll ? displaySorted : displaySorted.slice(0, initialLimit)).map((official, i) => (
            <tr
              key={official.slug}
              className={`border-b border-neutral-100 cursor-pointer transition-colors hover:bg-neutral-100 ${
                i % 2 === 1 ? "bg-neutral-50/50" : ""
              }`}
              onClick={() => {
                window.location.href = `/officials/${official.slug}`;
              }}
            >
              <td className="py-3 pr-4">
                <div className="flex items-center gap-3">
                  <OfficialAvatar
                    name={official.name}
                    slug={official.slug}
                    party={official.party}
                    size={36}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/officials/${official.slug}`}
                        className="text-neutral-900 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {displayName(official.name)}
                      </Link>
                      {newIngestedCutoff &&
                        (official.lastIngestedDate ?? "") >= newIngestedCutoff && (
                          <span
                            className="bg-neutral-900 text-white text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 sm:hidden"
                            title={`New filing ${formatDate(official.mostRecentFilingDate)}`}
                          >
                            New
                          </span>
                        )}
                    </div>
                    <div className="text-xs text-neutral-400 mt-0.5 hidden md:block">
                      {official.departedDate && (
                        <span className="text-[10px] uppercase tracking-wider text-amber-700 font-medium mr-1">Former </span>
                      )}
                      {official.title}
                    </div>
                    <div className="text-xs text-neutral-400 mt-0.5 md:hidden">
                      {official.departedDate && (
                        <span className="text-[10px] uppercase tracking-wider text-amber-700 font-medium mr-1">Former </span>
                      )}
                      {official.title} · {official.agency}
                    </div>
                  </div>
                </div>
              </td>
              <td className="py-3 pr-4 text-neutral-500 hidden md:table-cell">
                {official.agency}
              </td>
              <td className="py-3 pr-4 text-right tabular-nums font-[family-name:var(--font-dm-mono)] text-neutral-900">
                {official.transactionCount}
              </td>
              <td className="py-3 text-right text-neutral-500 tabular-nums hidden sm:table-cell">
                <span className="inline-flex items-center gap-2 justify-end">
                  {newIngestedCutoff &&
                    (official.lastIngestedDate ?? "") >= newIngestedCutoff && (
                      <span className="bg-neutral-900 text-white text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5">
                        New
                      </span>
                    )}
                  {formatDate(official.mostRecentFilingDate)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!showAll && initialLimit && displaySorted.length > initialLimit && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-4 w-full py-2.5 text-sm text-neutral-600 hover:text-neutral-900 border border-neutral-200 hover:border-neutral-400 transition-colors cursor-pointer"
        >
          Show all {displaySorted.length} officials
        </button>
      )}
    </div>
  );
}
