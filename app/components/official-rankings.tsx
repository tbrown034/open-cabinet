"use client";

import Link from "next/link";
import { formatCompactCurrency, displayName } from "@/lib/format";

interface RankingEntry {
  name: string;
  slug: string;
  title: string;
  totalValue: number;
  tradeCount: number;
}

export default function OfficialRankings({
  rankings,
}: {
  rankings: RankingEntry[];
}) {
  // Use log scale so officials with $3M are still visible next to $2.1B
  const logMax = Math.log10(Math.max(...rankings.map((r) => r.totalValue)));
  const logMin = Math.log10(Math.min(...rankings.map((r) => r.totalValue)));

  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-6">
        Top officials by estimated transaction volume
      </h2>

      <div className="space-y-1.5">
        {rankings.map((r) => {
          const logVal = Math.log10(r.totalValue);
          const pct = logMax > logMin
            ? ((logVal - logMin) / (logMax - logMin)) * 90 + 10
            : 100;
          return (
            <div key={r.slug} className="flex items-center gap-3 text-sm">
              <Link
                href={`/officials/${r.slug}`}
                className="w-44 shrink-0 text-right text-neutral-700 hover:underline truncate text-xs"
              >
                {displayName(r.name)}
              </Link>
              <div className="flex-1 h-5 bg-neutral-100">
                <div
                  className="h-full bg-neutral-800"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-16 text-right text-xs text-neutral-400 font-[family-name:var(--font-dm-mono)] tabular-nums shrink-0">
                {formatCompactCurrency(r.totalValue)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
