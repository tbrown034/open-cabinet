import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "fs";
import { getAllOfficialSlugs, getOfficialBySlug } from "@/lib/data";
import type { OfficialData } from "@/lib/types";
import { recordIdsFor, ROW_VERIFICATION_PATH, SHORT_LABEL, type RowGates, type RowVerification, type RowVerificationFile } from "@/lib/row-verification";
import { requireLocalReview } from "../review/local-only";

/**
 * Admin: every published row with what each gate said about it.
 *
 * Observability is a first-class feature (Trevor, Sep 6). One line per
 * row: the first read's confidence, then each gate's verdict, whether
 * the gates agree among themselves, whether a person looked, and the
 * final state. Reads data/meta/row-verification.json (gates are written
 * there by pnpm row-verification); nothing here calls a model or a
 * database. Local only, like /admin/review.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Rows by gate", robots: { index: false, follow: false } };

const NEGATIVE = new Set(["disagree", "dispute", "notfound", "rejected"]);
const POSITIVE = new Set(["agree", "confirm"]);

function gatesAgree(g: RowGates): "yes" | "no" | "n/a" {
  const verdicts = [g.text, g.ocr, g.model2, g.session, g.audit];
  if (verdicts.some((v) => NEGATIVE.has(v))) return "no";
  if (verdicts.some((v) => POSITIVE.has(v))) return "yes";
  return "n/a";
}

function cell(v: string | null) {
  const cls = v && NEGATIVE.has(v) ? "text-red-700 font-medium" : v && POSITIVE.has(v) ? "text-green-700" : v === "none" || v === null ? "text-neutral-300" : "text-amber-700";
  return <td className={`px-2 py-1 whitespace-nowrap ${cls}`}>{v ?? "—"}</td>;
}

export default async function RowsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireLocalReview();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const slugFilter = one("slug");
  const stateFilter = one("state");
  const only = one("only"); // "disagree" | "human" | "lowconf"
  const limit = Math.min(2000, Math.max(50, Number(one("limit")) || 300));

  const file = JSON.parse(readFileSync(ROW_VERIFICATION_PATH, "utf-8")) as RowVerificationFile;
  // Every official on disk, former ones included: the admin view covers
  // all 11,513 rows, not the current-roster subset the public pages use.
  const all = (await Promise.all((await getAllOfficialSlugs()).map((slug) => getOfficialBySlug(slug)))).filter((o): o is OfficialData => o !== null);
  const officials = all.filter((o) => !slugFilter || o.slug === slugFilter);

  type Line = { official: string; slug: string; tx: { date: string | null; description: string; type: string; amount: string | null; lateFilingFlag: boolean }; v: RowVerification };
  const lines: Line[] = [];
  const tally = { rows: 0, disagree: 0, human: 0, lowconf: 0 };
  for (const o of officials) {
    const ids = recordIdsFor(o.transactions);
    o.transactions.forEach((tx, i) => {
      const v = file.rows[ids[i]];
      if (!v) return;
      tally.rows++;
      const g = v.gates;
      const dis = g ? gatesAgree(g) === "no" : false;
      const hum = !!g?.human;
      const low = (g?.read1Confidence ?? 1) < 0.7;
      if (dis) tally.disagree++;
      if (hum) tally.human++;
      if (low) tally.lowconf++;
      if (stateFilter && v.state !== stateFilter) return;
      if (only === "disagree" && !dis) return;
      if (only === "human" && !hum) return;
      if (only === "lowconf" && !low) return;
      lines.push({ official: o.name, slug: o.slug, tx, v });
    });
  }
  lines.sort((a, b) => a.v.score - b.v.score || (a.v.gates?.read1Confidence ?? 1) - (b.v.gates?.read1Confidence ?? 1));
  const shown = lines.slice(0, limit);

  const link = (params: Record<string, string>) => {
    const q = new URLSearchParams({ ...(slugFilter ? { slug: slugFilter } : {}), ...(stateFilter ? { state: stateFilter } : {}), ...(only ? { only } : {}), ...params });
    for (const [k, val] of [...q.entries()]) if (!val) q.delete(k);
    return `/admin/rows?${q.toString()}`;
  };

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-8 text-sm">
      <h1 className="font-[family-name:var(--font-source-serif)] text-2xl mb-1">Rows by gate</h1>
      <p className="text-neutral-600 mb-4">
        {tally.rows.toLocaleString("en-US")} rows in scope. {tally.disagree.toLocaleString("en-US")} where at least one gate disagreed with the row; {tally.human.toLocaleString("en-US")} decided by a person; {tally.lowconf.toLocaleString("en-US")} where the first read's own confidence was under 0.7. Built {file.generatedAt.slice(0, 16).replace("T", " ")}. <Link className="underline" href="/admin/review">Review queue</Link>
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        <Link className={`px-2 py-1 border ${!only ? "bg-neutral-900 text-white" : ""}`} href={link({ only: "" })}>All</Link>
        <Link className={`px-2 py-1 border ${only === "disagree" ? "bg-neutral-900 text-white" : ""}`} href={link({ only: "disagree" })}>A gate disagreed</Link>
        <Link className={`px-2 py-1 border ${only === "human" ? "bg-neutral-900 text-white" : ""}`} href={link({ only: "human" })}>Person decided</Link>
        <Link className={`px-2 py-1 border ${only === "lowconf" ? "bg-neutral-900 text-white" : ""}`} href={link({ only: "lowconf" })}>First read under 0.7</Link>
        <form className="flex gap-2 items-center" action="/admin/rows" method="get">
          {only && <input type="hidden" name="only" value={only} />}
          <select name="slug" defaultValue={slugFilter} className="border px-1 py-1">
            <option value="">Every official</option>
            {all.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
          </select>
          <select name="state" defaultValue={stateFilter} className="border px-1 py-1">
            <option value="">Every state</option>
            {Object.keys(SHORT_LABEL).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="px-2 py-1 border" type="submit">Filter</button>
        </form>
      </div>
      <p className="text-xs text-neutral-500 mb-2">
        Gate columns: text = program on the PDF text layer; OCR = program on the page image; model 2 = second company&rsquo;s model; session = Claude Code page read; audit = third company&rsquo;s model shown the row. &ldquo;repaired&rdquo; means OCR&rsquo;s row number was fixed by sequence and does not count. Showing {shown.length.toLocaleString("en-US")} of {lines.length.toLocaleString("en-US")} matching rows, lowest score and confidence first.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-neutral-300 text-left">
              <th className="px-2 py-1">Official</th><th className="px-2 py-1">Date</th><th className="px-2 py-1">Description</th><th className="px-2 py-1">Type</th><th className="px-2 py-1">Amount</th><th className="px-2 py-1">Late</th>
              <th className="px-2 py-1">Read 1 conf</th><th className="px-2 py-1">Text</th><th className="px-2 py-1">OCR</th><th className="px-2 py-1">Model 2</th><th className="px-2 py-1">Session</th><th className="px-2 py-1">Audit</th>
              <th className="px-2 py-1">Gates agree</th><th className="px-2 py-1">Person</th><th className="px-2 py-1">Flag</th><th className="px-2 py-1">Score</th><th className="px-2 py-1">State</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ official, slug, tx, v }) => {
              const g = v.gates;
              return (
                <tr key={v.id} className={`border-b border-neutral-100 ${v.score < 3 ? "bg-amber-50" : ""}`}>
                  <td className="px-2 py-1 whitespace-nowrap"><Link className="underline" href={`/officials/${slug}`}>{official}</Link></td>
                  <td className="px-2 py-1 whitespace-nowrap">{tx.date ?? "N/A"}</td>
                  <td className="px-2 py-1 max-w-[320px] truncate" title={tx.description}>{tx.description}</td>
                  <td className="px-2 py-1">{tx.type}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{tx.amount ?? "n/a"}</td>
                  <td className="px-2 py-1">{tx.lateFilingFlag ? "yes" : "no"}</td>
                  <td className={`px-2 py-1 ${(g?.read1Confidence ?? 1) < 0.7 ? "text-amber-700" : ""}`}>{g?.read1Confidence == null ? "—" : g.read1Confidence.toFixed(2)}</td>
                  {cell(g?.text ?? null)}{cell(g?.ocr ?? null)}{cell(g?.model2 ?? null)}{cell(g?.session ?? null)}{cell(g?.audit ?? null)}
                  <td className={`px-2 py-1 ${g && gatesAgree(g) === "no" ? "text-red-700 font-medium" : ""}`}>{g ? gatesAgree(g) : "—"}</td>
                  <td className="px-2 py-1">{g?.human ?? "no"}</td>
                  <td className="px-2 py-1 text-amber-700">{g?.implausible?.length ? "yes" : ""}</td>
                  <td className="px-2 py-1 font-medium">{v.score}</td>
                  <td className="px-2 py-1 whitespace-nowrap" title={v.note}>{v.state}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
