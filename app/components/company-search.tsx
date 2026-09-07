"use client";

import UnderReviewNote from "./under-review-note";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { formatCompactCurrency } from "@/lib/format";

interface CompanyEntry {
  underReviewCount: number;
  ticker: string;
  companyName: string;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  officialCount: number;
  estimatedValue: number;
  /** Distinct names the filings printed for this symbol, so "General Electric" finds GE. */
  filedAs?: string[];
}

function rank(c: CompanyEntry, q: string): number {
  const t = c.ticker.toLowerCase();
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  if (c.companyName.toLowerCase().startsWith(q)) return 2;
  return 3;
}

export default function CompanySearch({
  companies,
}: {
  companies: CompanyEntry[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  // Exact symbol first, then symbol prefix, then name or any filed spelling.
  // A query of "GE" must put GE Aerospace above General Mills (Sep 7 user test).
  const q = query.trim().toLowerCase();
  const filtered = q
    ? companies
        .filter(
          (c) =>
            c.ticker.toLowerCase().includes(q) ||
            c.companyName.toLowerCase().includes(q) ||
            (c.filedAs ?? []).some((d) => d.toLowerCase().includes(q))
        )
        .toSorted((a, b) => rank(a, q) - rank(b, q))
    : companies;

  return (
    <div>
      <label htmlFor="company-search" className="sr-only">
        Search companies
      </label>
      <input
        id="company-search"
        type="text"
        placeholder="Search by ticker or company name..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full max-w-md border border-neutral-300 px-3 py-2 text-sm mb-8 focus:outline-none focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900 transition-colors"
      />

      <div className="text-xs text-neutral-400 mb-4">
        {filtered.length} {filtered.length === 1 ? "company" : "companies"}{" "}
        {query ? "matching" : "total"}
      </div>

      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-900 text-xs uppercase tracking-wider text-neutral-500">
              <th scope="col" className="pb-2 pr-3 font-medium">Ticker</th>
              <th scope="col" className="pb-2 pr-3 font-medium">Company</th>
              <th scope="col" className="pb-2 pr-3 font-medium text-right hidden sm:table-cell">Officials</th>
              <th scope="col" className="pb-2 pr-3 font-medium text-right">Sells</th>
              <th scope="col" className="pb-2 pr-3 font-medium text-right">Buys</th>
              <th scope="col" className="pb-2 font-medium text-right hidden sm:table-cell">Est. value</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((c, i) => (
              <tr
                key={c.ticker}
                className={`border-b border-neutral-100 hover:bg-neutral-100 transition-colors cursor-pointer ${
                  i % 2 === 1 ? "bg-neutral-50/50" : ""
                }`}
                onClick={() => router.push(`/companies/${c.ticker.toLowerCase()}`)}
              >
                <td className="py-2.5 pr-3 font-[family-name:var(--font-dm-mono)] text-neutral-900 font-medium">
                  <Link
                    href={`/companies/${c.ticker.toLowerCase()}`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:underline"
                  >
                    {c.ticker}
                  </Link>
                </td>
                <td className="py-2.5 pr-3 text-neutral-600 max-w-[160px] truncate sm:max-w-none sm:whitespace-normal" title={c.companyName}>
                  {c.companyName}
                  <UnderReviewNote count={c.underReviewCount} />
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-neutral-900 hidden sm:table-cell">
                  {c.officialCount}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums font-[family-name:var(--font-dm-mono)] text-red-700">
                  {c.sellCount || "—"}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums font-[family-name:var(--font-dm-mono)] text-emerald-700">
                  {c.buyCount || "—"}
                </td>
                <td className="py-2.5 text-right tabular-nums font-[family-name:var(--font-dm-mono)] text-neutral-500 hidden sm:table-cell">
                  {formatCompactCurrency(c.estimatedValue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
