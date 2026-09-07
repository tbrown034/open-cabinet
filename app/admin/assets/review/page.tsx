import type { Metadata } from "next";
import Link from "next/link";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { getAllOfficialSlugs, getOfficialBySlug } from "@/lib/data";
import type { OfficialData } from "@/lib/types";
import { recordIdsFor } from "@/lib/row-verification";
import { readAssetResolution, readDictionary, readExceptions } from "@/lib/asset-resolution";
import { loadAssetReference } from "@/lib/asset-reference";
import { requireLocalReview } from "../../review/local-only";
import { acceptAsset, rejectAsset } from "../actions";
import { parseRecommendationsCsv } from "@/scripts/asset-decide";

/**
 * Admin: approve the asset queue one name at a time, with the evidence a
 * person can actually check: the filing's own rows (as published, with a
 * link to the PDF), the exchange listing for the recommended symbol, the
 * SEC issuer, and the reason. Accept writes the dictionary; Skip moves
 * on; Never writes an exception. Local only. Trevor, Sep 7: "it's just
 * words without context"; this is the context.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Approve asset names", robots: { index: false, follow: false } };

const RECS = path.join(process.cwd(), "docs", "asset-queue-recommendations-2026-09-07.csv");

export default async function AssetReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireLocalReview();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const conf = one("conf") || "High";
  if (!existsSync(RECS)) return <main className="max-w-3xl mx-auto p-8">No recommendations file at docs/asset-queue-recommendations-2026-09-07.csv.</main>;
  const dict = readDictionary();
  const ex = readExceptions();
  const all = parseRecommendationsCsv(readFileSync(RECS, "utf-8")).filter((r) => r.symbol && (conf === "all" || r.confidence === conf));
  const pending = all.filter((r) => !dict.has(r.nameKey) && !ex.has(r.nameKey));
  const i = Math.min(Math.max(0, Number(one("i")) || 0), Math.max(0, pending.length - 1));
  const rec = pending[i];
  const here = `/admin/assets/review?conf=${conf}&i=${i}`;
  const nextUrl = `/admin/assets/review?conf=${conf}&i=${i}`; // after accept the item leaves the list, so the same index shows the next one

  if (!rec) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-8 text-sm">
        <h1 className="font-[family-name:var(--font-source-serif)] text-2xl mb-2">Approve asset names</h1>
        <p>Nothing left at confidence {conf}. {all.length - pending.length} of {all.length} decided. Now run: <code>pnpm asset-resolution && pnpm seed-assets && pnpm generate-exports && pnpm readme-stats && npx vitest run</code>, then commit.</p>
        <p className="mt-2"><Link className="underline" href="/admin/assets/review?conf=Medium">Medium ones</Link> · <Link className="underline" href="/admin/assets">Full queue</Link></p>
      </main>
    );
  }

  // The filing's own rows for this name: every published row whose key matches.
  const res = readAssetResolution();
  const ref = loadAssetReference();
  const slugs = await getAllOfficialSlugs();
  const officials = (await Promise.all(slugs.map((s) => getOfficialBySlug(s)))).filter((o): o is OfficialData => o !== null);
  const rows: Array<{ official: string; slug: string; description: string; type: string; date: string | null; amount: string | null; sourceUrl: string | null }> = [];
  for (const o of officials) {
    const ids = recordIdsFor(o.transactions);
    o.transactions.forEach((tx, k) => {
      const r = res?.rows[ids[k]];
      if (r && r.nameKey === rec.nameKey) rows.push({ official: o.name, slug: o.slug, description: tx.description, type: tx.type, date: tx.date, amount: tx.amount, sourceUrl: tx.sourceUrl ?? null });
    });
  }
  const listed = ref.listedBySymbol.get(rec.symbol);
  const sec = ref.secBySymbol.get(rec.symbol);
  const distinctDescriptions = [...new Set(rows.map((r) => r.description))].slice(0, 6);
  const byOfficial = new Map<string, number>();
  for (const r of rows) byOfficial.set(r.official, (byOfficial.get(r.official) ?? 0) + 1);
  const firstPdf = rows.find((r) => r.sourceUrl)?.sourceUrl ?? null;
  const localPdf = firstPdf ? `/admin/pdf?name=${encodeURIComponent(decodeURIComponent(firstPdf.split("/").pop() ?? ""))}` : null;

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 text-sm">
      <p className="text-neutral-500 mb-2">{i + 1} of {pending.length} left at confidence {conf} · {all.length - pending.length} decided · <Link className="underline" href="/admin/assets">full queue</Link></p>
      {one("message") && <p role="status" className="border border-neutral-300 p-2 mb-3">{one("message")}</p>}
      {one("error") && <p role="alert" className="border border-red-300 bg-red-50 p-2 mb-3">{one("error")}</p>}

      <h1 className="font-[family-name:var(--font-source-serif)] text-3xl mb-1">{rec.nameKey}</h1>
      <p className="text-neutral-600 mb-4">{rows.length} trades · {[...byOfficial.entries()].map(([n, c]) => `${n} (${c})`).join(", ")}</p>

      <section className="border border-neutral-300 p-4 mb-4">
        <h2 className="font-medium mb-2">What the filings print</h2>
        <ul className="list-disc pl-5 space-y-1">
          {distinctDescriptions.map((d) => <li key={d} className="font-mono text-xs">{d}</li>)}
        </ul>
        <p className="text-xs text-neutral-500 mt-2">
          Example trade: {rows[0].type} on {rows[0].date ?? "no date"}, {rows[0].amount ?? "no amount"}.
          {localPdf ? <> Open the filing: <a className="underline" href={localPdf} target="_blank" rel="noreferrer">local PDF</a>{firstPdf ? <> · <a className="underline" href={firstPdf} target="_blank" rel="noreferrer">OGE</a></> : null}</> : null}
        </p>
      </section>

      <section className="border border-neutral-300 p-4 mb-4">
        <h2 className="font-medium mb-2">Recommended: <span className="font-mono">{rec.symbol}</span> <span className="text-neutral-500">({rec.confidence})</span></h2>
        <p><strong>Exchange listing:</strong> {listed ? `${listed.name} (${listed.exchange})` : <span className="text-red-700">not in the Nasdaq directory</span>}</p>
        <p><strong>SEC issuer:</strong> {sec ? `${sec.name}, CIK ${sec.cik}` : <span className="text-neutral-500">not in the SEC issuer list (normal for ETFs)</span>}</p>
        <p className="mt-2 text-neutral-700"><strong>Why:</strong> {rec.reason}</p>
      </section>

      <div className="flex flex-wrap gap-3 items-start">
        <form action={acceptAsset}>
          <input type="hidden" name="nameKey" value={rec.nameKey} />
          <input type="hidden" name="symbol" value={rec.symbol} />
          <input type="hidden" name="evidence" value={`Trevor approved ${new Date().toISOString().slice(0, 10)} from the review screen. ${rec.confidence}: ${rec.reason}`} />
          <input type="hidden" name="next" value={nextUrl} />
          <button type="submit" className="px-4 py-2 bg-neutral-900 text-white">Yes, this is {rec.symbol}</button>
        </form>
        <Link href={`/admin/assets/review?conf=${conf}&i=${i + 1}`} className="px-4 py-2 border">Skip</Link>
        <form action={rejectAsset} className="flex gap-2 items-center">
          <input type="hidden" name="nameKey" value={rec.nameKey} />
          <input type="hidden" name="next" value={nextUrl} />
          <input name="reason" placeholder="why it must never resolve" className="border px-2 py-2 w-56" required />
          <button type="submit" className="px-3 py-2 border">Never</button>
        </form>
      </div>
      <p className="text-xs text-neutral-500 mt-4">Yes writes the dictionary; the rows resolve on the next rebuild. Skip leaves it for later. Never blocks the name for good. Links: <Link className="underline" href={`${here}&conf=Medium`}>Medium</Link> · <Link className="underline" href={`/admin/assets/review?conf=High&i=0`}>start over</Link></p>
    </main>
  );
}
