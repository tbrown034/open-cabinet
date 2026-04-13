"use client";

import { formatCompactCurrency } from "@/lib/format";

export default function BuySellRatio({
  salesCount,
  purchasesCount,
  salesValue,
  purchasesValue,
}: {
  salesCount: number;
  purchasesCount: number;
  salesValue: number;
  purchasesValue: number;
}) {
  const totalCount = salesCount + purchasesCount;
  const sellPct = totalCount > 0 ? (salesCount / totalCount) * 100 : 0;
  const buyPct = totalCount > 0 ? (purchasesCount / totalCount) * 100 : 0;

  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-medium mb-6">
        Sales vs. Purchases
      </h2>

      <div className="flex h-8 w-full overflow-hidden mb-3">
        <div
          className="bg-red-600 transition-all duration-500"
          style={{ width: `${sellPct}%` }}
        />
        <div
          className="bg-emerald-600 transition-all duration-500"
          style={{ width: `${buyPct}%` }}
        />
      </div>

      <div className="flex justify-between text-sm">
        <div className="text-red-700">
          <span className="font-semibold font-[family-name:var(--font-dm-mono)] tabular-nums">
            {salesCount}
          </span>{" "}
          sales (est. {formatCompactCurrency(salesValue)})
        </div>
        <div className="text-emerald-700">
          <span className="font-semibold font-[family-name:var(--font-dm-mono)] tabular-nums">
            {purchasesCount}
          </span>{" "}
          purchases (est. {formatCompactCurrency(purchasesValue)})
        </div>
      </div>
    </section>
  );
}
