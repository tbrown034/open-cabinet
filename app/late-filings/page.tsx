import type { Metadata } from "next";
import { getAllOfficials } from "@/lib/data";
import { formatDate, displayName } from "@/lib/format";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Late Filings — Open Cabinet",
  description:
    "563 late financial disclosures across 29 executive branch officials. Who's missing deadlines and what it means.",
};

function isSale(type: string): boolean {
  return type === "Sale" || type === "Sale (Partial)" || type === "Sale (Full)";
}

export default async function LateFilingsPage() {
  const officials = await getAllOfficials();

  // Calculate late filing stats per official
  const officialStats = officials
    .map((o) => {
      const total = o.transactions.length;
      const late = o.transactions.filter((t) => t.lateFilingFlag).length;
      const lateRate = total > 0 ? (late / total) * 100 : 0;
      const lateSales = o.transactions.filter(
        (t) => t.lateFilingFlag && isSale(t.type)
      ).length;
      const latePurchases = o.transactions.filter(
        (t) => t.lateFilingFlag && t.type === "Purchase"
      ).length;
      const lateDates = o.transactions
        .filter((t) => t.lateFilingFlag)
        .map((t) => t.date)
        .sort();

      return {
        name: o.name,
        slug: o.slug,
        title: o.title,
        agency: o.agency,
        total,
        late,
        lateRate,
        lateSales,
        latePurchases,
        earliest: lateDates[0] || "",
        latest: lateDates[lateDates.length - 1] || "",
      };
    })
    .filter((o) => o.late > 0)
    .sort((a, b) => b.late - a.late);

  const totalLate = officialStats.reduce((sum, o) => sum + o.late, 0);
  const totalTransactions = officials.reduce(
    (sum, o) => sum + o.transactions.length,
    0
  );
  const overallRate = ((totalLate / totalTransactions) * 100).toFixed(1);
  const officialsWithLate = officialStats.length;

  // Find officials with 100% late rate
  const allLate = officialStats.filter((o) => o.lateRate === 100);
  // Find officials with >50% late rate
  const mostlyLate = officialStats.filter(
    (o) => o.lateRate > 50 && o.lateRate < 100
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <header className="mb-12">
        <h1 className="font-[family-name:var(--font-source-serif)] text-4xl md:text-5xl text-neutral-900 mb-4 leading-tight">
          Late filings
        </h1>
        <p className="text-neutral-500 max-w-xl leading-relaxed">
          The STOCK Act requires officials to disclose stock trades within 30
          days of notification — 45 days from the transaction at most. When that
          deadline passes, the filing is late. The penalty is a $200 fee that is
          routinely waived.
        </p>
      </header>

      {/* Stats */}
      <div className="flex flex-wrap gap-x-8 gap-y-2 mb-12 text-sm text-neutral-500 border-b border-neutral-200 pb-6">
        <div>
          <span className="text-2xl font-semibold text-amber-700 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1.5">
            {totalLate}
          </span>
          late filings
        </div>
        <div>
          <span className="text-2xl font-semibold text-neutral-900 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1.5">
            {overallRate}%
          </span>
          of all transactions
        </div>
        <div>
          <span className="text-2xl font-semibold text-neutral-900 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1.5">
            {officialsWithLate}
          </span>
          officials with late filings
        </div>
      </div>

      {/* Key findings */}
      <section className="mb-12 space-y-6">
        <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900">
          Key findings
        </h2>

        {allLate.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 px-4 py-3 text-sm">
            <div className="font-medium text-amber-900 mb-1">
              100% late filing rate
            </div>
            <p className="text-amber-800">
              {allLate.map((o) => displayName(o.name)).join(", ")}{" "}
              {allLate.length === 1 ? "filed" : "each filed"} every single
              transaction late.{" "}
              {allLate.map((o) => `${displayName(o.name)}: ${o.late} of ${o.total}`).join("; ")}
              .
            </p>
          </div>
        )}

        {mostlyLate.length > 0 && (
          <div className="bg-stone-50 border border-neutral-200 px-4 py-3 text-sm">
            <div className="font-medium text-neutral-900 mb-1">
              Majority late ({">"}50%)
            </div>
            <p className="text-neutral-600">
              {mostlyLate
                .map(
                  (o) =>
                    `${displayName(o.name)}: ${o.lateRate.toFixed(0)}% (${o.late}/${o.total})`
                )
                .join("; ")}
            </p>
          </div>
        )}

        <div className="bg-stone-50 border border-neutral-200 px-4 py-3 text-sm">
          <div className="font-medium text-neutral-900 mb-1">
            The $200 question
          </div>
          <p className="text-neutral-600">
            Under 5 U.S.C. Section 13106(a), each late filing carries a $200
            fee. It{"'"}s routinely waived. No executive branch official has ever
            been meaningfully sanctioned for late 278-T filings. At {totalLate}{" "}
            late filings, the theoretical maximum penalty is $
            {(totalLate * 200).toLocaleString()} — but that assumes one fee per
            transaction. The actual fee is per report, not per transaction.
          </p>
        </div>
      </section>

      {/* Officials table */}
      <section>
        <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-4">
          By official
        </h2>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-900 text-xs uppercase tracking-wider text-neutral-500">
                <th className="pb-2 pr-3 font-medium">Official</th>
                <th className="pb-2 pr-3 font-medium text-right">Late</th>
                <th className="pb-2 pr-3 font-medium text-right">Total</th>
                <th className="pb-2 pr-3 font-medium text-right">Rate</th>
                <th className="pb-2 pr-3 font-medium text-right hidden sm:table-cell">
                  Sales
                </th>
                <th className="pb-2 font-medium text-right hidden sm:table-cell">
                  Purchases
                </th>
              </tr>
            </thead>
            <tbody>
              {officialStats.map((o, i) => (
                <tr
                  key={o.slug}
                  className={`border-b border-neutral-100 hover:bg-neutral-100 transition-colors cursor-pointer ${
                    i % 2 === 1 ? "bg-neutral-50/50" : ""
                  }`}
                  onClick={() => {
                    window.location.href = `/officials/${o.slug}`;
                  }}
                >
                  <td className="py-2.5 pr-3">
                    <Link
                      href={`/officials/${o.slug}`}
                      className="text-neutral-900 hover:underline font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {displayName(o.name)}
                    </Link>
                    <div className="text-xs text-neutral-400 mt-0.5 hidden sm:block">
                      {o.title}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums font-[family-name:var(--font-dm-mono)] text-amber-700 font-medium">
                    {o.late}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums font-[family-name:var(--font-dm-mono)]">
                    {o.total}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    <span
                      className={
                        o.lateRate === 100
                          ? "text-red-700 font-medium"
                          : o.lateRate > 50
                          ? "text-amber-700"
                          : "text-neutral-600"
                      }
                    >
                      {o.lateRate.toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-red-700 hidden sm:table-cell">
                    {o.lateSales || "—"}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-emerald-700 hidden sm:table-cell">
                    {o.latePurchases || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Context */}
      <section className="mt-12 bg-stone-50 -mx-4 px-4 py-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-[family-name:var(--font-source-serif)] text-2xl text-neutral-900 mb-4">
            What does {"\""}late{"\""} mean?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm text-neutral-600">
            <div>
              <div className="font-medium text-neutral-900 mb-1">
                The self-certification
              </div>
              <p>
                Each 278-T form has a column: {"\""}Notification Received Over 30
                Days Ago.{"\""} Officials mark Yes or No. A {"\""}Yes{"\""} is a
                self-admission that they reported late. Open Cabinet reads this
                field directly from the OGE filings.
              </p>
            </div>
            <div>
              <div className="font-medium text-neutral-900 mb-1">
                The enforcement gap
              </div>
              <p>
                A 2022 Business Insider investigation found at least 72 members
                of Congress violated the same deadline. The penalty — $200,
                routinely waived — has never deterred anyone. No criminal
                prosecution has ever been brought under the STOCK Act.
              </p>
            </div>
          </div>
        </div>
      </section>

      <p className="text-xs text-neutral-400 mt-8">
        Source: U.S. Office of Government Ethics, 278-T Periodic Transaction
        Reports. Late filing status is self-reported by filers on each form.{" "}
        <Link href="/about" className="underline hover:text-neutral-600">
          Read more about methodology
        </Link>
        .
      </p>
    </div>
  );
}
