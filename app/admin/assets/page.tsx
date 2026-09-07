import type { Metadata } from "next";
import Link from "next/link";
import { assetQueue } from "@/scripts/asset-decide";
import { loadAssetReference } from "@/lib/asset-reference";
import { readAssetResolution } from "@/lib/asset-resolution";
import { requireLocalReview } from "../review/local-only";
import { acceptAsset, rejectAsset } from "./actions";

/**
 * Admin: the names the asset resolution lane could not tie to a company,
 * most rows first, with the candidates and evidence the lane found. One
 * decision here covers every row with that printed name. Accept writes
 * the dictionary (rule R2); reject writes the exceptions (rule R0); both
 * apply on the next pnpm asset-resolution. Local only.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Asset queue", robots: { index: false, follow: false } };

export default async function AssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireLocalReview();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const min = Math.max(1, Number(one("min")) || 3);
  const limit = Math.min(500, Math.max(20, Number(one("limit")) || 100));
  const file = readAssetResolution();
  const ref = loadAssetReference();
  const queue = assetQueue(min);
  const rowsInQueue = queue.reduce((n, q) => n + q.rows, 0);
  const tiers = file?.summary.byTier ?? {};
  const shown = queue.slice(0, limit);
  const listedName = (sym: string) => ref.listedBySymbol.get(sym)?.name ?? ref.secBySymbol.get(sym)?.name ?? "";

  return (
    <main className="max-w-[1300px] mx-auto px-4 py-8 text-sm">
      <h1 className="font-[family-name:var(--font-source-serif)] text-2xl mb-1">Asset queue</h1>
      <p className="text-neutral-600 mb-2">
        Stocks and ETFs: {(tiers.T1 ?? 0).toLocaleString("en-US")} rows tied to a company (T1), {(tiers.T2 ?? 0).toLocaleString("en-US")} with a candidate for you (T2), {(tiers.none ?? 0).toLocaleString("en-US")} with no match.
        {" "}{queue.length.toLocaleString("en-US")} names with {min}+ rows cover {rowsInQueue.toLocaleString("en-US")} rows. Built {file?.generatedAt.slice(0, 16).replace("T", " ") ?? "never"}.
        {" "}<Link className="underline" href="/admin/rows">Rows by gate</Link>
      </p>
      <p className="text-xs text-neutral-500 mb-4">
        Accept only when you have checked the listing name against the printed name. A symbol must be a common stock or ETF in the Nasdaq directory. Reject a name that should never resolve. Either decision covers every row with that printed name and applies after <code>pnpm asset-resolution</code>. Filter: <Link className="underline" href="/admin/assets?min=1">1+ rows</Link> · <Link className="underline" href="/admin/assets?min=3">3+</Link> · <Link className="underline" href="/admin/assets?min=10">10+</Link>
      </p>
      {one("message") && <p role="status" className="border border-neutral-300 p-3 mb-4">{one("message")}</p>}
      {one("error") && <p role="alert" className="border border-red-300 bg-red-50 p-3 mb-4">{one("error")}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-neutral-300 text-left">
              <th className="px-2 py-1">Rows</th><th className="px-2 py-1">Printed name (key)</th><th className="px-2 py-1">Type</th><th className="px-2 py-1">Officials</th><th className="px-2 py-1">Lane said</th><th className="px-2 py-1">Candidates</th><th className="px-2 py-1">Decide</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((q) => (
              <tr key={q.nameKey} className="border-b border-neutral-100 align-top">
                <td className="px-2 py-2 tabular-nums">{q.rows}</td>
                <td className="px-2 py-2 font-medium max-w-[300px]">{q.nameKey}</td>
                <td className="px-2 py-2">{q.type}</td>
                <td className="px-2 py-2 max-w-[160px] truncate" title={q.officials.join(", ")}>{q.officials.length === 1 ? q.officials[0] : `${q.officials.length} officials`}</td>
                <td className="px-2 py-2 max-w-[220px]">{q.rule}</td>
                <td className="px-2 py-2">
                  {q.candidates.length === 0 ? <span className="text-neutral-400">none</span> : q.candidates.map((c) => (
                    <div key={c}><span className="font-mono">{c}</span> <span className="text-neutral-500">{listedName(c).slice(0, 60)}</span></div>
                  ))}
                </td>
                <td className="px-2 py-2 min-w-[300px]">
                  <form action={acceptAsset} className="flex flex-wrap gap-1 mb-1">
                    <input type="hidden" name="nameKey" value={q.nameKey} />
                    <input name="symbol" placeholder="SYMBOL" defaultValue={q.candidates.length === 1 ? q.candidates[0] : ""} className="border px-1 py-0.5 w-20 font-mono" required />
                    <input name="evidence" placeholder="what you checked" className="border px-1 py-0.5 w-44" required />
                    <button type="submit" className="border px-2 py-0.5">Accept</button>
                  </form>
                  <form action={rejectAsset} className="flex flex-wrap gap-1">
                    <input type="hidden" name="nameKey" value={q.nameKey} />
                    <input name="reason" placeholder="why it must never resolve" className="border px-1 py-0.5 w-44" required />
                    <button type="submit" className="border px-2 py-0.5">Reject</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
