"use client";

import { useState } from "react";
import Link from "next/link";
import type { OfficialIndexEntry } from "@/lib/types";
import { formatDate } from "@/lib/format";
import OfficialAvatar from "./official-avatar";

type SortKey = "name" | "agency" | "transactionCount" | "mostRecentFilingDate";
type SortDirection = "asc" | "desc";

export default function OfficialsTable({
  officials,
}: {
  officials: OfficialIndexEntry[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

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

  const arrow = sortDir === "asc" ? " ↑" : " ↓";

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-neutral-900 text-xs uppercase tracking-wider text-neutral-500">
            <th className="pb-2 pr-4 font-medium">
              <button
                onClick={() => handleSort("name")}
                className="hover:text-neutral-900 transition-colors cursor-pointer"
              >
                Name{sortKey === "name" ? arrow : ""}
              </button>
            </th>
            <th className="pb-2 pr-4 font-medium hidden md:table-cell">
              <button
                onClick={() => handleSort("agency")}
                className="hover:text-neutral-900 transition-colors cursor-pointer"
              >
                Agency{sortKey === "agency" ? arrow : ""}
              </button>
            </th>
            <th className="pb-2 pr-4 font-medium text-right">
              <button
                onClick={() => handleSort("transactionCount")}
                className="hover:text-neutral-900 transition-colors cursor-pointer"
              >
                Trades{sortKey === "transactionCount" ? arrow : ""}
              </button>
            </th>
            <th className="pb-2 font-medium text-right hidden sm:table-cell">
              <button
                onClick={() => handleSort("mostRecentFilingDate")}
                className="hover:text-neutral-900 transition-colors cursor-pointer"
              >
                Latest filing
                {sortKey === "mostRecentFilingDate" ? arrow : ""}
              </button>
            </th>
          </tr>
        </thead>
        <tbody className="text-sm">
          {sorted.map((official, i) => (
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
                    party={official.party}
                    size={36}
                  />
                  <div>
                    <Link
                      href={`/officials/${official.slug}`}
                      className="text-neutral-900 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {official.name}
                    </Link>
                    <div className="text-xs text-neutral-400 mt-0.5">
                      {official.title}
                    </div>
                    <div className="text-xs text-neutral-400 mt-0.5 md:hidden">
                      {official.agency}
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
                {formatDate(official.mostRecentFilingDate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
