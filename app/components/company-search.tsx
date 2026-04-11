"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCompactCurrency } from "@/lib/format";

interface CompanyEntry {
  ticker: string;
  companyName: string;
  tradeCount: number;
  officialCount: number;
  estimatedValue: number;
}

export default function CompanySearch({
  companies,
}: {
  companies: CompanyEntry[];
}) {
  const [query, setQuery] = useState("");

  const filtered = query
    ? companies.filter(
        (c) =>
          c.ticker.toLowerCase().includes(query.toLowerCase()) ||
          c.companyName.toLowerCase().includes(query.toLowerCase())
      )
    : companies;

  return (
    <div>
      <input
        type="text"
        placeholder="Search by ticker or company name..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full max-w-md border border-neutral-300 px-3 py-2 text-sm mb-8 focus:outline-none focus:border-neutral-900 transition-colors"
      />

      <div className="text-xs text-neutral-400 mb-4">
        {filtered.length} {filtered.length === 1 ? "company" : "companies"}{" "}
        {query ? "matching" : "total"}
      </div>

      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-900 text-xs uppercase tracking-wider text-neutral-500">
              <th className="pb-2 pr-4 font-medium">Ticker</th>
              <th className="pb-2 pr-4 font-medium">Company</th>
              <th className="pb-2 pr-4 font-medium text-right">Officials</th>
              <th className="pb-2 pr-4 font-medium text-right">Trades</th>
              <th className="pb-2 font-medium text-right">Est. value</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((c, i) => (
              <tr
                key={c.ticker}
                className={`border-b border-neutral-100 hover:bg-neutral-100 transition-colors cursor-pointer ${
                  i % 2 === 1 ? "bg-neutral-50/50" : ""
                }`}
                onClick={() => {
                  window.location.href = `/companies/${c.ticker.toLowerCase()}`;
                }}
              >
                <td className="py-2.5 pr-4 font-[family-name:var(--font-dm-mono)] text-neutral-900 font-medium">
                  <Link
                    href={`/companies/${c.ticker.toLowerCase()}`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:underline"
                  >
                    {c.ticker}
                  </Link>
                </td>
                <td className="py-2.5 pr-4 text-neutral-600">{c.companyName}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums text-neutral-900">
                  {c.officialCount}
                </td>
                <td className="py-2.5 pr-4 text-right tabular-nums font-[family-name:var(--font-dm-mono)]">
                  {c.tradeCount}
                </td>
                <td className="py-2.5 text-right tabular-nums font-[family-name:var(--font-dm-mono)] text-neutral-500">
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
