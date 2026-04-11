import { getOfficialsIndex } from "@/lib/data";
import OfficialsTable from "./components/officials-table";

export default async function Home() {
  const index = await getOfficialsIndex();
  const { officials } = index;

  const totalOfficials = officials.length;
  const totalTransactions = officials.reduce(
    (sum, o) => sum + o.transactionCount,
    0
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <header className="mb-12">
        <h1 className="font-[family-name:var(--font-instrument-serif)] text-4xl md:text-5xl text-neutral-900 mb-4 leading-tight">
          Executive Branch
          <br />
          Financial Disclosures
        </h1>
        <p className="text-neutral-500 max-w-xl leading-relaxed">
          Tracking stock trades and financial transactions reported by cabinet
          secretaries, agency heads, and senior government officials under the
          STOCK Act.
        </p>
      </header>

      <div className="flex gap-8 mb-12 text-sm text-neutral-500 border-b border-neutral-200 pb-6">
        <div>
          <span className="text-2xl font-semibold text-neutral-900 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1.5">
            {totalOfficials}
          </span>
          officials
        </div>
        <div>
          <span className="text-2xl font-semibold text-neutral-900 font-[family-name:var(--font-dm-mono)] tabular-nums mr-1.5">
            {totalTransactions}
          </span>
          transactions
        </div>
      </div>

      <OfficialsTable officials={officials} />

      <p className="text-xs text-neutral-400 mt-8">
        Source: U.S. Office of Government Ethics. Values reported in ranges per
        federal law. Last updated {index.lastUpdated}.
      </p>
    </div>
  );
}
